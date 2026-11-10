/**
 * FurnitureManager — Bridges BuilderStore (state) to Phaser scene (visuals).
 *
 * Analogous to PlayerManager: subscribes to Zustand and manages FurnitureSprite
 * lifecycle. When items are added/removed/moved in the store, the manager
 * creates/destroys/repositions the corresponding sprites.
 *
 * Also handles:
 *   - Initial layout loading (spawning sprites for all pre-placed items)
 *   - Depth sort updates
 *   - Edit-mode hover/selection state forwarding
 */

import Phaser from 'phaser';
import { useBuilderStore } from '../state/builder.store';
import { FurnitureSprite } from '../entities/FurnitureSprite';
import { getCatalogItem } from '../catalog/default-catalog';
import type { PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint } from '../catalog/furniture-catalog';
import type { IsoLayout } from '../../spatial/utils/isometric';
import { snapToGrid, furnitureDepth } from '../../spatial/utils/isometric';

export class FurnitureManager {
  private scene: Phaser.Scene;
  private sprites: Map<string, FurnitureSprite> = new Map();
  private unsubscribe: (() => void) | null = null;
  private layout: IsoLayout;

  constructor(scene: Phaser.Scene, layout: IsoLayout) {
    this.scene = scene;
    this.layout = layout;
  }

  // ─── Lifecycle ───

  public init(): void {
    const state = useBuilderStore.getState();

    // 1. Spawn sprites for all initially loaded placed items
    for (const item of state.placedItems) {
      this.spawnSprite(item);
    }

    // 2. Subscribe to placedItems changes in the store
    this.unsubscribe = useBuilderStore.subscribe(
      (s) => s.placedItems,
      (newItems, prevItems) => {
        this.diffAndUpdate(newItems, prevItems);
      },
    );
  }

  /**
   * Handle edit-mode pointer interaction — highlight the furniture item
   * under the cursor.
   */
  public handleHover(worldX: number, worldY: number): string | null {
    const gridPos = snapToGrid(worldX, worldY, this.layout);

    const grid = useBuilderStore.getState().getOccupancyGrid();
    const instanceId = grid.getAt(gridPos.gx, gridPos.gy);

    // Update highlight state on all sprites
    this.sprites.forEach((sprite, id) => {
      sprite.setHighlighted(id === instanceId);
    });

    return instanceId;
  }

  /**
   * Clear all highlights (called when exiting edit mode or moving cursor
   * outside the grid).
   */
  public clearHighlights(): void {
    this.sprites.forEach((sprite) => {
      sprite.setHighlighted(false);
    });
  }

  /**
   * Update selection state to match the store's selectedInstanceId.
   */
  public updateSelection(selectedInstanceId: string | null): void {
    this.sprites.forEach((sprite, id) => {
      sprite.setSelected(id === selectedInstanceId);
    });
  }

  /** Get a sprite by instance ID. */
  public getSprite(instanceId: string): FurnitureSprite | undefined {
    return this.sprites.get(instanceId);
  }

  // ─── Internal ───

  private diffAndUpdate(
    newItems: PlacedFurnitureItem[],
    prevItems: PlacedFurnitureItem[],
  ): void {
    const newIds = new Set(newItems.map((i) => i.instanceId));
    const prevIds = new Set(prevItems.map((i) => i.instanceId));

    // Items added
    for (const item of newItems) {
      if (!prevIds.has(item.instanceId)) {
        this.spawnSprite(item);
      }
    }

    // Items removed
    for (const item of prevItems) {
      if (!newIds.has(item.instanceId)) {
        this.removeSprite(item.instanceId);
      }
    }

    // Items moved or rotated
    for (const newItem of newItems) {
      if (!prevIds.has(newItem.instanceId)) continue; // skip newly added
      const prevItem = prevItems.find((i) => i.instanceId === newItem.instanceId);
      if (!prevItem) continue;

      if (
        prevItem.gridX !== newItem.gridX ||
        prevItem.gridY !== newItem.gridY ||
        prevItem.rotation !== newItem.rotation
      ) {
        const sprite = this.sprites.get(newItem.instanceId);
        if (sprite) {
          sprite.updateGridPosition(newItem.gridX, newItem.gridY, this.layout);
        }
      }
    }
  }

  private spawnSprite(item: PlacedFurnitureItem): void {
    // Don't double-spawn
    if (this.sprites.has(item.instanceId)) return;

    const definition = getCatalogItem(item.catalogId);
    if (!definition) {
      console.warn(`[FurnitureManager] Unknown catalog item: ${item.catalogId}`);
      return;
    }

    const sprite = new FurnitureSprite(this.scene, item, definition, this.layout);
    this.sprites.set(item.instanceId, sprite);
  }

  private removeSprite(instanceId: string): void {
    const sprite = this.sprites.get(instanceId);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(instanceId);
    }
  }

  // ─── Depth Sort ───

  /**
   * Re-sort all furniture sprites by iso depth.
   * Called after bulk layout changes.
   */
  public updateDepthSort(): void {
    for (const [, sprite] of this.sprites) {
      const pos = sprite.getGridPosition();
      const rotation = sprite.getRotation();
      const definition = getCatalogItem(sprite.catalogId);
      if (!definition) continue;

      const footprint = getRotatedFootprint(definition.footprint, rotation);
      const depth = furnitureDepth(pos.gx, pos.gy, footprint, definition.depthOffset);
      sprite.setDepth(depth);
    }
  }

  // ─── Cleanup ───

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.sprites.forEach((sprite) => sprite.destroy());
    this.sprites.clear();
  }
}
