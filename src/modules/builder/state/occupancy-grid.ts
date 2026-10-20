/**
 * OccupancyGrid — Pure-logic 2D grid tracking cell occupancy.
 *
 * No Phaser dependency. No Zustand dependency. Fully serializable to JSON.
 *
 * Each cell stores either:
 *   - null: the cell is free
 *   - string: the instanceId of the furniture item occupying it
 *
 * The grid dimensions match the office grid (24 cols × 18 rows for default).
 * Per design decision: no sub-grid — 1:1 mapping to isometric tiles.
 */

import type { PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint, getCellsOccupied } from '../catalog/furniture-catalog';
import { getCatalogItem } from '../catalog/default-catalog';

export class OccupancyGrid {
  private grid: (string | null)[][];

  constructor(
    public readonly cols: number,
    public readonly rows: number,
  ) {
    this.grid = OccupancyGrid.createEmptyGrid(cols, rows);
  }

  // ─── Queries ───

  /** Check if a furniture item can be placed at (gx, gy) with the given footprint. */
  canPlace(
    gx: number,
    gy: number,
    footprint: [number, number],
    excludeInstanceId?: string,
  ): boolean {
    const cells = getCellsOccupied(gx, gy, footprint);
    for (const cell of cells) {
      // Bounds check
      if (cell.gx < 0 || cell.gx >= this.cols || cell.gy < 0 || cell.gy >= this.rows) {
        return false;
      }
      // Occupancy check
      const occupant = this.grid[cell.gy][cell.gx];
      if (occupant !== null && occupant !== excludeInstanceId) {
        return false;
      }
    }
    return true;
  }

  /** Get the instanceId at a specific cell, or null if empty. */
  getAt(gx: number, gy: number): string | null {
    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) {
      return null;
    }
    return this.grid[gy][gx];
  }

  /** Check if a cell is within grid bounds. */
  isInBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows;
  }

  // ─── Mutations ───

  /** Place an item — marks all occupied cells with the instanceId. */
  place(item: PlacedFurnitureItem): void {
    const definition = getCatalogItem(item.catalogId);
    if (!definition) return;

    const rotated = getRotatedFootprint(definition.footprint, item.rotation);
    const cells = getCellsOccupied(item.gridX, item.gridY, rotated);

    for (const cell of cells) {
      if (cell.gx >= 0 && cell.gx < this.cols && cell.gy >= 0 && cell.gy < this.rows) {
        this.grid[cell.gy][cell.gx] = item.instanceId;
      }
    }
  }

  /** Remove an item — clears all cells occupied by this instanceId. */
  remove(instanceId: string): void {
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (this.grid[row][col] === instanceId) {
          this.grid[row][col] = null;
        }
      }
    }
  }

  /** Clear the entire grid. */
  clear(): void {
    this.grid = OccupancyGrid.createEmptyGrid(this.cols, this.rows);
  }

  // ─── Bulk operations ───

  /** Rebuild the grid from a list of placed items. */
  rebuildFrom(items: PlacedFurnitureItem[]): void {
    this.clear();
    for (const item of items) {
      this.place(item);
    }
  }

  // ─── Serialization ───

  /** Serialize the grid to a compact JSON object. */
  serialize(): OccupancyGridSnapshot {
    // Only store non-null cells to minimize payload
    const occupied: { gx: number; gy: number; instanceId: string }[] = [];
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const id = this.grid[row][col];
        if (id !== null) {
          occupied.push({ gx: col, gy: row, instanceId: id });
        }
      }
    }
    return { cols: this.cols, rows: this.rows, occupied };
  }

  /** Restore from a serialized snapshot. */
  static deserialize(snapshot: OccupancyGridSnapshot): OccupancyGrid {
    const grid = new OccupancyGrid(snapshot.cols, snapshot.rows);
    for (const cell of snapshot.occupied) {
      if (
        cell.gx >= 0 && cell.gx < snapshot.cols &&
        cell.gy >= 0 && cell.gy < snapshot.rows
      ) {
        grid.grid[cell.gy][cell.gx] = cell.instanceId;
      }
    }
    return grid;
  }

  // ─── Internal ───

  private static createEmptyGrid(cols: number, rows: number): (string | null)[][] {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  }
}

// ─── Serialization Types ───

export interface OccupancyGridSnapshot {
  cols: number;
  rows: number;
  occupied: { gx: number; gy: number; instanceId: string }[];
}
