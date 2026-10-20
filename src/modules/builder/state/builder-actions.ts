/**
 * Builder Actions — Command pattern for undo/redo.
 *
 * Every mutation to the placed furniture list is recorded as a reversible
 * action. The BuilderStore pushes each action onto the undoStack and
 * clears the redoStack. Undo pops from undoStack and pushes the inverse
 * onto redoStack (and vice versa for redo).
 */

import type { PlacedFurnitureItem } from '../catalog/furniture-catalog';

// ─── Action Types ───

export interface PlaceAction {
  type: 'PLACE';
  item: PlacedFurnitureItem;
}

export interface RemoveAction {
  type: 'REMOVE';
  item: PlacedFurnitureItem;
}

export interface MoveAction {
  type: 'MOVE';
  instanceId: string;
  fromGx: number;
  fromGy: number;
  toGx: number;
  toGy: number;
}

export interface RotateAction {
  type: 'ROTATE';
  instanceId: string;
  fromRotation: number;
  toRotation: number;
}

export type BuilderAction = PlaceAction | RemoveAction | MoveAction | RotateAction;

// ─── Inverse Helpers ───

/**
 * Returns the inverse of an action — used for undo/redo.
 *   PLACE → REMOVE (and vice versa)
 *   MOVE → MOVE with swapped from/to
 *   ROTATE → ROTATE with swapped from/to
 */
export function invertAction(action: BuilderAction): BuilderAction {
  switch (action.type) {
    case 'PLACE':
      return { type: 'REMOVE', item: action.item };

    case 'REMOVE':
      return { type: 'PLACE', item: action.item };

    case 'MOVE':
      return {
        type: 'MOVE',
        instanceId: action.instanceId,
        fromGx: action.toGx,
        fromGy: action.toGy,
        toGx: action.fromGx,
        toGy: action.fromGy,
      };

    case 'ROTATE':
      return {
        type: 'ROTATE',
        instanceId: action.instanceId,
        fromRotation: action.toRotation,
        toRotation: action.fromRotation,
      };
  }
}
