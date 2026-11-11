/**
 * FurnitureManager — Bridges BuilderStore (state) to Phaser scene (visuals).
 *
 * Subscribes to `placedItems` and creates/destroys/repositions FurnitureSprites. After every change it
 * re-lays out the whole office:
 *   - surface items (monitors, R-26) standing on a host get lifted by the host's `surfaceHeight` and sort
 *     just after it
 *   - decals (rugs, R-27) draw under everything else
 *   - every other item starts from its footprint's front tip (R-22). One key per item is not enough for
 *     long items side by side (a 3-wide divider and the desk in front of it share a key), so items that
 *     overlap on screen are ordered by their footprints: when one lies wholly behind the other on a grid
 *     axis it gets the lower key (a topological order). Items register as DepthSorter occluders with
 *     these keys; tall items fade when they hide your own avatar (R-35)
 *   - `onLayoutChanged` reports the items so OfficeScene can update the collision grid
 */

import Phaser from 'phaser';
import { useBuilderStore } from '../state/builder.store';
import { FurnitureSprite, type SeatPose } from '../entities/FurnitureSprite';
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
  rectsOverlap,
  snapToGrid,
  type IsoLayout,
} from '../../spatial/utils/isometric';
import { classifyBoxes, type DepthSorter, type GridBox } from '../../spatial/systems/DepthSorter';
import type { ScreenRect } from '../../spatial/utils/isometric';

/** Keeps items with equal sort keys in a stable order (far below every other step). */
const TIE_BREAK = 0.000001;
/** Minimum key gap between an item and one that must draw over it. */
const KEY_STEP = 0.02;
/** A surface item's key above its host (below KEY_STEP, so things in front of the host stay in front). */
const SURFACE_STEP = 0.01;

interface LaidOutItem {
  item: PlacedFurnitureItem;
  sprite: FurnitureSprite;
  footprint: [number, number];
  box: GridBox;
  rect: ScreenRect;
  lift: number;
  hostId: string | null;
  baseKey: number;
  key: number;
}

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

  // ─── Seats ───

  /** How to sit on an item, or null if it does not exist or is not a seat. */
  public getSeat(instanceId: string): SeatPose | null {
    return this.sprites.get(instanceId)?.getSeatPose() ?? null;
  }

  /** The front-most seat drawn under a world point (for clicks and hover). */
  public findSeatAt(worldX: number, worldY: number): string | null {
    let bestId: string | null = null;
    let bestDepth = -Infinity;
    for (const [id, sprite] of this.sprites) {
      if (!sprite.getSeatPose() || !sprite.containsPoint(worldX, worldY)) continue;
      if (sprite.depth > bestDepth) {
        bestId = id;
        bestDepth = sprite.depth;
      }
    }
    return bestId;
  }

  /** The closest seat whose cell centre is within `maxDistance` grid units, skipping `excluded` ids. */
  public findNearestSeat(gx: number, gy: number, maxDistance: number, excluded: Set<string>): string | null {
    let bestId: string | null = null;
    let bestDistance = maxDistance;
    for (const [id, sprite] of this.sprites) {
      if (excluded.has(id)) continue;
      const pose = sprite.getSeatPose();
      if (!pose) continue;
      const distance = Math.hypot(pose.gx - gx, pose.gy - gy);
      if (distance <= bestDistance) {
        bestId = id;
        bestDistance = distance;
      }
    }
    return bestId;
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
    const hostByCell = new Map<string, { id: string; height: number }>();
    for (const item of items) {
      const definition = getCatalogItem(item.catalogId);
      if (!definition?.surfaceHeight || !this.sprites.has(item.instanceId) || isSurfaceItem(definition)) continue;
      const footprint = getRotatedFootprint(definition.footprint, item.rotation);
      for (const cell of getCellsOccupied(item.gridX, item.gridY, footprint)) {
        hostByCell.set(`${cell.gx},${cell.gy}`, { id: item.instanceId, height: definition.surfaceHeight });
      }
    }

    // 1. Place every item and collect what sorting needs.
    const floorItems: LaidOutItem[] = [];
    const surfaceItems: LaidOutItem[] = [];
    const index = new Map<string, number>();
    items.forEach((item, i) => {
      index.set(item.instanceId, i);
      const definition = getCatalogItem(item.catalogId);
      const sprite = this.sprites.get(item.instanceId);
      if (!definition || !sprite) return;

      const footprint = getRotatedFootprint(definition.footprint, item.rotation);
      const host = isSurfaceItem(definition) ? hostByCell.get(`${item.gridX},${item.gridY}`) : undefined;
      const lift = host?.height ?? 0;
      sprite.setPlacement(item.gridX, item.gridY, item.rotation, lift);

      if (sprite.isDecal()) {
        sprite.setDepth(DEPTH.DECAL + i * TIE_BREAK);
        this.sorter.remove(occluderId(item.instanceId));
        return;
      }

      const baseKey = footprintSortKey(item.gridX, item.gridY, footprint);
      const laidOut: LaidOutItem = {
        item,
        sprite,
        footprint,
        box: { x0: item.gridX, y0: item.gridY, x1: item.gridX + footprint[0], y1: item.gridY + footprint[1] },
        rect: footprintScreenRect(item.gridX, item.gridY, footprint, sprite.getArtHeight(), this.layout, lift),
        lift,
        hostId: host?.id ?? null,
        baseKey,
        key: baseKey,
      };
      (host ? surfaceItems : floorItems).push(laidOut);
    });

    // 2. Floor items: order overlapping ones by their footprints; surface items ride on their host.
    orderByFootprint(floorItems);
    const keyById = new Map(floorItems.map((entry) => [entry.item.instanceId, entry.key]));
    for (const entry of surfaceItems) {
      entry.key = (keyById.get(entry.hostId ?? '') ?? entry.baseKey) + SURFACE_STEP;
    }

    // 3. Depth and occluders.
    for (const entry of [...floorItems, ...surfaceItems]) {
      const { item, sprite } = entry;
      sprite.setDepth(depthForKey(entry.key) + (index.get(item.instanceId) ?? 0) * TIE_BREAK);
      const fadeable = sprite.getArtHeight() >= TALL_ITEM_HEIGHT && !entry.hostId;
      this.sorter.set(occluderId(item.instanceId), [
        {
          key: entry.key,
          box: entry.box,
          rect: entry.rect,
          setFade: fadeable ? (faded) => sprite.setFaded(faded) : undefined,
        },
      ]);
    }

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

/**
 * Sets each entry's `key` so that, of two items overlapping on screen, the one whose footprint lies wholly
 * behind the other on a grid axis has the lower key. Keys never drop below the item's own front-tip key.
 * Kahn's algorithm, taking the lowest base key first; a cycle (only possible with odd overlaps) falls back to
 * the base keys of what is left.
 */
function orderByFootprint(entries: LaidOutItem[]): void {
  const n = entries.length;
  const after: number[][] = entries.map(() => []); // i → items that must draw after i
  const pending = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!rectsOverlap(entries[i].rect, entries[j].rect)) continue;
      const relation = classifyBoxes(entries[i].box, entries[j].box);
      if (relation === 'behind') {
        after[i].push(j);
        pending[j]++;
      } else if (relation === 'front') {
        after[j].push(i);
        pending[i]++;
      }
    }
  }

  const done = new Array<boolean>(n).fill(false);
  const floorKey = entries.map((entry) => entry.baseKey);
  for (let placed = 0; placed < n; placed++) {
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || pending[i] > 0) continue;
      if (next < 0 || entries[i].baseKey < entries[next].baseKey) next = i;
    }
    if (next < 0) {
      // Cycle: take the lowest remaining base key and ignore its unmet constraints.
      for (let i = 0; i < n; i++) {
        if (!done[i] && (next < 0 || entries[i].baseKey < entries[next].baseKey)) next = i;
      }
    }
    done[next] = true;
    entries[next].key = floorKey[next];
    for (const j of after[next]) {
      pending[j]--;
      floorKey[j] = Math.max(floorKey[j], entries[next].key + KEY_STEP);
    }
  }
}

