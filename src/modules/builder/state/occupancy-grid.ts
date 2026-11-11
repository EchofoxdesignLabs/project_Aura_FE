/**
 * OccupancyGrid — Pure-logic 2D grid tracking cell occupancy.
 *
 * No Phaser dependency. No Zustand dependency.
 *
 * Two layers, each cell holding null (free) or the instanceId occupying it:
 *   - floor:   ordinary furniture
 *   - surface: surface items (monitors, R-26) standing on a host's top
 *
 * A surface item may share cells with a host (an item with `surfaceHeight`, e.g. a desk) or stand on empty
 * floor. A floor item may not cover a cell holding a surface item unless it is itself a host.
 *
 * The grid dimensions match the office grid (24 cols × 18 rows for default). 1:1 mapping to isometric tiles.
 */

import type { PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint, getCellsOccupied, isSurfaceItem } from '../catalog/furniture-catalog';
import { getCatalogItem } from '../catalog/default-catalog';

type Layer = (string | null)[][];

export class OccupancyGrid {
  readonly cols: number;
  readonly rows: number;
  private floor: Layer;
  private surface: Layer;
  /** Placed items that surface items may stand on (definition has surfaceHeight). */
  private hostIds = new Set<string>();

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.floor = OccupancyGrid.createEmptyLayer(cols, rows);
    this.surface = OccupancyGrid.createEmptyLayer(cols, rows);
  }

  // ─── Queries ───

  /**
   * Can an item of `catalogId` be placed at (gx, gy) with the given (rotated) footprint?
   * `excludeInstanceId` ignores the item being moved or rotated.
   */
  canPlace(
    gx: number,
    gy: number,
    footprint: [number, number],
    catalogId: string,
    excludeInstanceId?: string,
  ): boolean {
    const definition = getCatalogItem(catalogId);
    if (!definition) return false;
    const surfaceItem = isSurfaceItem(definition);
    const isHost = (definition.surfaceHeight ?? 0) > 0;
    const free = (id: string | null) => id === null || id === excludeInstanceId;

    for (const cell of getCellsOccupied(gx, gy, footprint)) {
      if (!this.isInBounds(cell.gx, cell.gy)) return false;
      const floorId = this.floor[cell.gy][cell.gx];
      const surfaceId = this.surface[cell.gy][cell.gx];

      if (surfaceItem) {
        if (!free(surfaceId)) return false;
        if (!free(floorId) && !this.isHostId(floorId)) return false;
      } else {
        if (!free(floorId)) return false;
        if (!free(surfaceId) && !isHost) return false;
      }
    }
    return true;
  }

  /** The floor item at a cell (null if none or out of bounds). */
  getAt(gx: number, gy: number): string | null {
    return this.isInBounds(gx, gy) ? this.floor[gy][gx] : null;
  }

  /** The top-most item at a cell: a surface item if there is one, otherwise the floor item. */
  getTopAt(gx: number, gy: number): string | null {
    if (!this.isInBounds(gx, gy)) return null;
    return this.surface[gy][gx] ?? this.floor[gy][gx];
  }

  isInBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows;
  }

  // ─── Mutations ───

  place(item: PlacedFurnitureItem): void {
    const definition = getCatalogItem(item.catalogId);
    if (!definition) return;

    const layer = isSurfaceItem(definition) ? this.surface : this.floor;
    if ((definition.surfaceHeight ?? 0) > 0) this.hostIds.add(item.instanceId);
    const rotated = getRotatedFootprint(definition.footprint, item.rotation);
    for (const cell of getCellsOccupied(item.gridX, item.gridY, rotated)) {
      if (this.isInBounds(cell.gx, cell.gy)) {
        layer[cell.gy][cell.gx] = item.instanceId;
      }
    }
  }

  remove(instanceId: string): void {
    this.hostIds.delete(instanceId);
    for (const layer of [this.floor, this.surface]) {
      for (const row of layer) {
        for (let col = 0; col < row.length; col++) {
          if (row[col] === instanceId) row[col] = null;
        }
      }
    }
  }

  clear(): void {
    this.floor = OccupancyGrid.createEmptyLayer(this.cols, this.rows);
    this.surface = OccupancyGrid.createEmptyLayer(this.cols, this.rows);
    this.hostIds.clear();
  }

  rebuildFrom(items: PlacedFurnitureItem[]): void {
    this.clear();
    for (const item of items) {
      this.place(item);
    }
  }

  // ─── Internal ───

  private isHostId(instanceId: string | null): boolean {
    return instanceId !== null && this.hostIds.has(instanceId);
  }

  private static createEmptyLayer(cols: number, rows: number): Layer {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  }
}
