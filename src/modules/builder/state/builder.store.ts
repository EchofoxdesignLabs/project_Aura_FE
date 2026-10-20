/**
 * Builder Store — Zustand state management for the office builder.
 *
 * Decoupled from gameStore. The only bridge is the `isEditMode` flag
 * which the InputManager and OfficeScene read to switch behavior.
 *
 * State flow:
 *   1. Admin clicks "Edit Office" → enterEditMode()
 *   2. Admin selects item from catalog → selectCatalogItem()
 *   3. Mouse moves over grid → updateGhostPosition()
 *   4. Validator checks occupancy → ghostValid updates
 *   5. Admin clicks → placeItem() (if valid)
 *   6. Action pushed to undoStack, item added to placedItems
 *   7. FurnitureManager subscribes and spawns FurnitureSprite
 *   8. WebSocket emits furniture:placed to other clients
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { FurnitureDefinition, PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint } from '../catalog/furniture-catalog';
import { getCatalogItem } from '../catalog/default-catalog';
import { OccupancyGrid } from './occupancy-grid';
import { invertAction, type BuilderAction } from './builder-actions';
import { socketService } from '@core/services/socket.service';
import type { SocketClientToServerEvents } from '@core/types';

function safeEmit<EventName extends keyof SocketClientToServerEvents>(
  event: EventName,
  ...args: Parameters<SocketClientToServerEvents[EventName]>
): void {
  try {
    if (socketService.isConnected()) {
      socketService.emit(event, ...args);
    }
  } catch (error) {
    console.warn(`[BuilderStore] Failed to emit socket event ${event}:`, error);
  }
}

// ─── Constants ───

const MAX_UNDO_STACK = 50;

// ─── Store Data ───

interface BuilderStoreData {
  // Mode
  isEditMode: boolean;

  // Catalog selection
  selectedCatalogItem: FurnitureDefinition | null;
  currentRotation: number;

  // Placed items (source of truth, serializable)
  placedItems: PlacedFurnitureItem[];

  // Ghost cursor state (for the placement preview)
  ghostGridX: number;
  ghostGridY: number;
  ghostValid: boolean;

  // Undo/Redo stacks
  undoStack: BuilderAction[];
  redoStack: BuilderAction[];

  // Persistence
  isSaving: boolean;
  lastSavedAt: number | null;
  isDirty: boolean;

  // Selected existing item (for move/delete)
  selectedInstanceId: string | null;

  // Catalog panel visibility
  isCatalogOpen: boolean;

  // Delete mode
  isDeleteMode: boolean;
}

// ─── Store Actions ───

export interface BuilderState extends BuilderStoreData {
  // Mode
  enterEditMode: () => void;
  exitEditMode: () => void;

  // Catalog
  selectCatalogItem: (item: FurnitureDefinition) => void;
  clearSelection: () => void;
  rotateCurrent: () => void;
  toggleCatalog: () => void;
  toggleDeleteMode: () => void;

  // Ghost
  updateGhostPosition: (gx: number, gy: number) => void;

  // Placement
  placeItem: () => PlacedFurnitureItem | null;
  removeItem: (instanceId: string) => void;
  moveItem: (instanceId: string, newGx: number, newGy: number) => boolean;

  // Selection
  selectInstance: (instanceId: string | null) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;

  // Persistence
  loadLayout: (items: PlacedFurnitureItem[], cols: number, rows: number) => void;
  markSaving: (saving: boolean) => void;
  markSaved: () => void;

  // Remote actions (received from WebSocket)
  remotePlaceItem: (item: PlacedFurnitureItem) => void;
  remoteRemoveItem: (instanceId: string) => void;
  remoteMoveItem: (instanceId: string, gridX: number, gridY: number, rotation: number) => void;

  // Grid access (not stored in Zustand — accessed via getter)
  getOccupancyGrid: () => OccupancyGrid;

  // Reset
  reset: () => void;
}

// ─── Occupancy Grid (managed alongside store but not IN the store) ───

// Zustand shouldn't hold class instances with methods. We keep the grid
// in a module-scoped variable and sync it imperatively.
let occupancyGrid = new OccupancyGrid(24, 18);

// ─── UUID Generation ───

function generateInstanceId(): string {
  return crypto.randomUUID();
}

// ─── Initial State ───

function createInitialData(): BuilderStoreData {
  return {
    isEditMode: false,
    selectedCatalogItem: null,
    currentRotation: 0,
    placedItems: [],
    ghostGridX: 0,
    ghostGridY: 0,
    ghostValid: false,
    undoStack: [],
    redoStack: [],
    isSaving: false,
    lastSavedAt: null,
    isDirty: false,
    selectedInstanceId: null,
    isCatalogOpen: false,
    isDeleteMode: false,
  };
}

// ─── Store ───

export const useBuilderStore = create<BuilderState>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialData(),

    // ─── Mode ───

    enterEditMode: () =>
      set(() => ({
        isEditMode: true,
        isCatalogOpen: true,
      })),

    exitEditMode: () =>
      set(() => ({
        isEditMode: false,
        selectedCatalogItem: null,
        selectedInstanceId: null,
        isCatalogOpen: false,
        isDeleteMode: false,
        currentRotation: 0,
      })),

    // ─── Catalog ───

    selectCatalogItem: (item) =>
      set(() => ({
        selectedCatalogItem: item,
        currentRotation: item.allowedRotations[0] ?? 0,
        selectedInstanceId: null,
        isDeleteMode: false,
      })),

    clearSelection: () =>
      set(() => ({
        selectedCatalogItem: null,
        currentRotation: 0,
        ghostValid: false,
      })),

    rotateCurrent: () =>
      set((state) => {
        // If we have a selected placed item, rotate it instead
        if (state.selectedInstanceId) {
          const item = state.placedItems.find(i => i.instanceId === state.selectedInstanceId);
          if (!item) return {};
          const definition = getCatalogItem(item.catalogId);
          if (!definition) return {};

          const rotations = definition.allowedRotations;
          if (rotations.length <= 1) return {};

          const currentIndex = rotations.indexOf(item.rotation);
          const nextIndex = (currentIndex + 1) % rotations.length;
          const nextRotation = rotations[nextIndex];

          // Check if it fits in the new rotation
          const rotatedFootprint = getRotatedFootprint(definition.footprint, nextRotation);
          if (!occupancyGrid.canPlace(item.gridX, item.gridY, rotatedFootprint, item.instanceId)) {
            return {};
          }

          occupancyGrid.remove(item.instanceId);
          const updatedItem = { ...item, rotation: nextRotation };
          occupancyGrid.place(updatedItem);

          const action: BuilderAction = {
            type: 'ROTATE',
            instanceId: item.instanceId,
            fromRotation: item.rotation,
            toRotation: nextRotation,
          };

          safeEmit('furniture:move', {
            instanceId: item.instanceId,
            gridX: item.gridX,
            gridY: item.gridY,
            rotation: nextRotation,
          });

          return {
            placedItems: state.placedItems.map(i => i.instanceId === state.selectedInstanceId ? updatedItem : i),
            undoStack: [...state.undoStack.slice(-MAX_UNDO_STACK + 1), action],
            redoStack: [],
            isDirty: true,
          };
        }

        if (!state.selectedCatalogItem) return {};

        const rotations = state.selectedCatalogItem.allowedRotations;
        if (rotations.length <= 1) return {};

        const currentIndex = rotations.indexOf(state.currentRotation);
        const nextIndex = (currentIndex + 1) % rotations.length;
        const nextRotation = rotations[nextIndex];

        // Revalidate ghost position with new rotation
        const rotatedFootprint = getRotatedFootprint(
          state.selectedCatalogItem.footprint,
          nextRotation,
        );
        const isValid = occupancyGrid.canPlace(
          state.ghostGridX,
          state.ghostGridY,
          rotatedFootprint,
        );

        return {
          currentRotation: nextRotation,
          ghostValid: isValid,
        };
      }),

    toggleCatalog: () =>
      set((state) => ({ isCatalogOpen: !state.isCatalogOpen })),

    toggleDeleteMode: () =>
      set((state) => ({
        isDeleteMode: !state.isDeleteMode,
        selectedCatalogItem: state.isDeleteMode ? state.selectedCatalogItem : null,
        selectedInstanceId: null,
      })),

    // ─── Ghost ───

    updateGhostPosition: (gx, gy) =>
      set((state) => {
        if (!state.selectedCatalogItem) {
          return { ghostGridX: gx, ghostGridY: gy, ghostValid: false };
        }

        const rotatedFootprint = getRotatedFootprint(
          state.selectedCatalogItem.footprint,
          state.currentRotation,
        );
        const isValid = occupancyGrid.canPlace(gx, gy, rotatedFootprint);

        return {
          ghostGridX: gx,
          ghostGridY: gy,
          ghostValid: isValid,
        };
      }),

    // ─── Placement ───

    placeItem: () => {
      const state = get();
      if (!state.selectedCatalogItem || !state.ghostValid) return null;

      const newItem: PlacedFurnitureItem = {
        instanceId: generateInstanceId(),
        catalogId: state.selectedCatalogItem.id,
        gridX: state.ghostGridX,
        gridY: state.ghostGridY,
        rotation: state.currentRotation,
      };

      // Update occupancy grid
      occupancyGrid.place(newItem);

      // Push action to undo stack
      const action: BuilderAction = { type: 'PLACE', item: newItem };

      set((s) => ({
        placedItems: [...s.placedItems, newItem],
        undoStack: [...s.undoStack.slice(-MAX_UNDO_STACK + 1), action],
        redoStack: [],
        isDirty: true,
      }));

      // Sync via WebSocket
      safeEmit('furniture:place', newItem);

      return newItem;
    },

    removeItem: (instanceId) => {
      const state = get();
      const item = state.placedItems.find((i) => i.instanceId === instanceId);
      if (!item) return;

      // Update occupancy grid
      occupancyGrid.remove(instanceId);

      // Push action to undo stack
      const action: BuilderAction = { type: 'REMOVE', item };

      set((s) => ({
        placedItems: s.placedItems.filter((i) => i.instanceId !== instanceId),
        undoStack: [...s.undoStack.slice(-MAX_UNDO_STACK + 1), action],
        redoStack: [],
        isDirty: true,
        selectedInstanceId:
          s.selectedInstanceId === instanceId ? null : s.selectedInstanceId,
      }));

      // Sync via WebSocket
      safeEmit('furniture:remove', { instanceId });
    },

    moveItem: (instanceId, newGx, newGy) => {
      const state = get();
      const item = state.placedItems.find((i) => i.instanceId === instanceId);
      if (!item) return false;

      const definition = getCatalogItem(item.catalogId);
      if (!definition) return false;

      const rotatedFootprint = getRotatedFootprint(definition.footprint, item.rotation);
      if (!occupancyGrid.canPlace(newGx, newGy, rotatedFootprint, instanceId)) {
        return false;
      }

      // Update occupancy grid
      occupancyGrid.remove(instanceId);
      const updatedItem = { ...item, gridX: newGx, gridY: newGy };
      occupancyGrid.place(updatedItem);

      // Push action
      const action: BuilderAction = {
        type: 'MOVE',
        instanceId,
        fromGx: item.gridX,
        fromGy: item.gridY,
        toGx: newGx,
        toGy: newGy,
      };

      set((s) => ({
        placedItems: s.placedItems.map((i) =>
          i.instanceId === instanceId ? updatedItem : i,
        ),
        undoStack: [...s.undoStack.slice(-MAX_UNDO_STACK + 1), action],
        redoStack: [],
        isDirty: true,
      }));

      // Sync via WebSocket
      safeEmit('furniture:move', {
        instanceId,
        gridX: newGx,
        gridY: newGy,
        rotation: item.rotation,
      });

      return true;
    },

    // ─── Selection ───

    selectInstance: (instanceId) =>
      set(() => ({
        selectedInstanceId: instanceId,
        selectedCatalogItem: null,
      })),

    // ─── Undo/Redo ───

    undo: () => {
      const state = get();
      if (state.undoStack.length === 0) return;

      const action = state.undoStack[state.undoStack.length - 1];
      const inverse = invertAction(action);

      // Apply the inverse action
      applyAction(inverse, get, set);

      set((s) => ({
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, action],
        isDirty: true,
      }));
    },

    redo: () => {
      const state = get();
      if (state.redoStack.length === 0) return;

      const action = state.redoStack[state.redoStack.length - 1];

      // Apply the action
      applyAction(action, get, set);

      set((s) => ({
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, action],
        isDirty: true,
      }));
    },

    // ─── Remote Actions (from WebSocket) ───

    remotePlaceItem: (item) => {
      if (get().placedItems.some((i) => i.instanceId === item.instanceId)) return;
      occupancyGrid.place(item);
      set((s) => ({
        placedItems: [...s.placedItems, item],
      }));
    },

    remoteRemoveItem: (instanceId) => {
      if (!get().placedItems.some((i) => i.instanceId === instanceId)) return;
      occupancyGrid.remove(instanceId);
      set((s) => ({
        placedItems: s.placedItems.filter((i) => i.instanceId !== instanceId),
        selectedInstanceId: s.selectedInstanceId === instanceId ? null : s.selectedInstanceId,
      }));
    },

    remoteMoveItem: (instanceId, gridX, gridY, rotation) => {
      const item = get().placedItems.find((i) => i.instanceId === instanceId);
      if (!item) return;

      occupancyGrid.remove(instanceId);
      const updatedItem = { ...item, gridX, gridY, rotation };
      occupancyGrid.place(updatedItem);

      set((s) => ({
        placedItems: s.placedItems.map((i) =>
          i.instanceId === instanceId ? updatedItem : i,
        ),
      }));
    },

    // ─── Persistence ───

    loadLayout: (items, cols, rows) => {
      occupancyGrid = new OccupancyGrid(cols, rows);
      occupancyGrid.rebuildFrom(items);

      set(() => ({
        placedItems: [...items],
        undoStack: [],
        redoStack: [],
        isDirty: false,
      }));
    },

    markSaving: (saving) => set(() => ({ isSaving: saving })),

    markSaved: () =>
      set(() => ({
        isSaving: false,
        isDirty: false,
        lastSavedAt: Date.now(),
      })),

    // ─── Grid Access ───

    getOccupancyGrid: () => occupancyGrid,

    // ─── Reset ───

    reset: () => {
      occupancyGrid = new OccupancyGrid(24, 18);
      set(() => createInitialData());
    },
  })),
);

// ─── Action Applicator (used by undo/redo) ───

function applyAction(
  action: BuilderAction,
  get: () => BuilderState,
  set: (
    partial:
      | Partial<BuilderState>
      | ((state: BuilderState) => Partial<BuilderState>),
  ) => void,
): void {
  switch (action.type) {
    case 'PLACE': {
      occupancyGrid.place(action.item);
      set((s) => ({
        placedItems: [...s.placedItems, action.item],
      }));
      safeEmit('furniture:place', action.item);
      break;
    }

    case 'REMOVE': {
      occupancyGrid.remove(action.item.instanceId);
      set((s) => ({
        placedItems: s.placedItems.filter(
          (i) => i.instanceId !== action.item.instanceId,
        ),
      }));
      safeEmit('furniture:remove', { instanceId: action.item.instanceId });
      break;
    }

    case 'MOVE': {
      const item = get().placedItems.find(
        (i) => i.instanceId === action.instanceId,
      );
      if (!item) break;

      occupancyGrid.remove(action.instanceId);
      const updatedItem = { ...item, gridX: action.toGx, gridY: action.toGy };
      occupancyGrid.place(updatedItem);

      set((s) => ({
        placedItems: s.placedItems.map((i) =>
          i.instanceId === action.instanceId ? updatedItem : i,
        ),
      }));
      safeEmit('furniture:move', {
        instanceId: action.instanceId,
        gridX: action.toGx,
        gridY: action.toGy,
        rotation: item.rotation,
      });
      break;
    }

    case 'ROTATE': {
      const item = get().placedItems.find(
        (i) => i.instanceId === action.instanceId,
      );
      if (!item) break;

      occupancyGrid.remove(action.instanceId);
      const updatedItem = { ...item, rotation: action.toRotation };
      occupancyGrid.place(updatedItem);

      set((s) => ({
        placedItems: s.placedItems.map((i) =>
          i.instanceId === action.instanceId ? updatedItem : i,
        ),
      }));
      safeEmit('furniture:move', {
        instanceId: action.instanceId,
        gridX: item.gridX,
        gridY: item.gridY,
        rotation: action.toRotation,
      });
      break;
    }
  }
}
