/**
 * FurnitureManager — Bridges BuilderStore (state) to Phaser scene (visuals).
 *
 * Subscribes to `placedItems` and creates/destroys/repositions FurnitureSprites. After every change it
 * re-lays out the whole office:
 *   - surface items (monitors, R-26) standing on a host get lifted by the host's `surfaceHeight` and sort
 *     just after it (host key + 0.5)
 *   - decals (rugs, R-27) draw under everything else
 *   - every other item sorts by its footprint's front tip (R-22) and registers as a DepthSorter occluder;
 *     tall items fade when they hide your own avatar (R-35)
 *   - `onLayoutChanged` reports the items so OfficeScene can update the collision grid
 */

import Phaser from 'phaser';
import { useBuilderStore } from '../state/builder.store';
import { FurnitureSprite } from '../entities/FurnitureSprite';
import { getCatalogItem } from '../catalog/default-catalog';
import {
  getCellsOccupied,
  getRotatedFootprint,
  isSurfaceItem,
  type PlacedFurnitureItem,
} from '../catalog/furniture-catalog';
import { TALL_ITEM_HEIGHT } from '../catalog/furniture-art';
import {
  DEPTH,
  depthForKey,
  footprintScreenRect,
  footprintSortKey,
  snapToGrid,
  type IsoLayout,
} from '../../spatial/utils/isometric';
import type { DepthSorter } from '../../spatial/systems/DepthSorter';

/** Keeps items with equal sort keys in a stable order. */
const TIE_BREAK = 0.001;

export class FurnitureManager {
  private scene: Phaser.Scene;
  private sprites: Map<string, FurnitureSprite> = new Map();
  private unsubscribe: (() => void) | null = null;
  private layout: IsoLayout;
  private sorter: DepthSorter;
  private onLayoutChanged: (items: PlacedFurnitureItem[]) => void;

  constructor(
    scene: Phaser.Scene,
    layout: IsoLayout,
    sorter: DepthSorter,
    onLayoutChanged: (items: PlacedFurnitureItem[]) => void = () => {},
  ) {
    this.scene = scene;
    this.layout = layout;
    this.sorter = sorter;
    this.onLayoutChanged = onLayoutChanged;
  }

  // ─── Lifecycle ───

  public init(): void {
    const { placedItems } = useBuilderStore.getState();
    for (const item of placedItems) this.spawnSprite(item);
    this.relayout(placedItems);

    this.unsubscribe = useBuilderStore.subscribe(
      (s) => s.placedItems,
      (newItems, prevItems) => this.diffAndUpdate(newItems, prevItems),
    );
  }

  /** Highlights the item under the cursor in edit mode. Returns its instanceId. */
  public handleHover(worldX: number, worldY: number): string | null {
    const gridPos = snapToGrid(worldX, worldY, this.layout);
    const instanceId = useBuilderStore.getState().getOccupancyGrid().getTopAt(gridPos.gx, gridPos.gy);
    this.sprites.forEach((sprite, id) => sprite.setHighlighted(id === instanceId));
    return instanceId;
  }

  public clearHighlights(): void {
    this.sprites.forEach((sprite) => sprite.setHighlighted(false));
  }

  public updateSelection(selectedInstanceId: string | null): void {
    this.sprites.forEach((sprite, id) => sprite.setSelected(id === selectedInstanceId));
  }

  public getSprite(instanceId: string): FurnitureSprite | undefined {
    return this.sprites.get(instanceId);
  }

  public destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.sprites.forEach((sprite, id) => {
      this.sorter.remove(occluderId(id));
      sprite.destroy();
    });
    this.sprites.clear();
  }

  // ─── Internal ───

  private diffAndUpdate(newItems: PlacedFurnitureItem[], prevItems: PlacedFurnitureItem[]): void {
    const newIds = new Set(newItems.map((i) => i.instanceId));

    for (const item of prevItems) {
      if (!newIds.has(item.instanceId)) this.removeSprite(item.instanceId);
    }
    for (const item of newItems) {
      if (!this.sprites.has(item.instanceId)) this.spawnSprite(item);
    }
    this.relayout(newItems);
  }

  /** Positions, sorts and registers every item. Cheap enough to run on every layout change. */
  private relayout(items: PlacedFurnitureItem[]): void {
    // Hosts by cell, for surface items.
    const hostByCell = new Map<string, { key: number; height: number }>();
    for (const item of items) {
      const definition = getCatalogItem(item.catalogId);
      if (!definition?.surfaceHeight || !this.sprites.has(item.instanceId) || isSurfaceItem(definition)) continue;
      const footprint = getRotatedFootprint(definition.footprint, item.rotation);
      const key = footprintSortKey(item.gridX, item.gridY, footprint);
      for (const cell of getCellsOccupied(item.gridX, item.gridY, footprint)) {
        hostByCell.set(`${cell.gx},${cell.gy}`, { key, height: definition.surfaceHeight });
      }
    }

    items.forEach((item, index) => {
      const definition = getCatalogItem(item.catalogId);
      const sprite = this.sprites.get(item.instanceId);
      if (!definition || !sprite) return;

      const footprint = getRotatedFootprint(definition.footprint, item.rotation);
      const host = isSurfaceItem(definition) ? hostByCell.get(`${item.gridX},${item.gridY}`) : undefined;
      const lift = host?.height ?? 0;
      sprite.setPlacement(item.gridX, item.gridY, item.rotation, lift);

      const tieBreak = index * TIE_BREAK;
      if (sprite.isDecal()) {
        sprite.setDepth(DEPTH.DECAL + tieBreak);
        this.sorter.remove(occluderId(item.instanceId));
        return;
      }

      const key = host ? host.key + 0.5 : footprintSortKey(item.gridX, item.gridY, footprint);
      sprite.setDepth(depthForKey(key) + tieBreak);

      const fadeable = sprite.getArtHeight() >= TALL_ITEM_HEIGHT && !host;
      this.sorter.set(occluderId(item.instanceId), [
        {
          key,
          box: {
            x0: item.gridX,
            y0: item.gridY,
            x1: item.gridX + footprint[0],
            y1: item.gridY + footprint[1],
          },
          rect: footprintScreenRect(item.gridX, item.gridY, footprint, sprite.getArtHeight(), this.layout, lift),
          setFade: fadeable ? (faded) => sprite.setFaded(faded) : undefined,
        },
      ]);
    });

    this.onLayoutChanged(items);
  }

  private spawnSprite(item: PlacedFurnitureItem): void {
    if (this.sprites.has(item.instanceId)) return;

    const definition = getCatalogItem(item.catalogId);
    if (!definition) {
      console.warn(`[FurnitureManager] Unknown catalog item: ${item.catalogId}`);
      return;
    }
    this.sprites.set(item.instanceId, new FurnitureSprite(this.scene, item, definition, this.layout));
  }

  private removeSprite(instanceId: string): void {
    const sprite = this.sprites.get(instanceId);
    if (sprite) {
      this.sorter.remove(occluderId(instanceId));
      sprite.destroy();
      this.sprites.delete(instanceId);
    }
  }
}

function occluderId(instanceId: string): string {
  return `furniture:${instanceId}`;
}

