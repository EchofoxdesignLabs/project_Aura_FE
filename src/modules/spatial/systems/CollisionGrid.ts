/**
 * CollisionGrid — grid-space collision for the isometric office. Pure, no Phaser dependency.
 *
 * Adapted from Aura_Assets/integration/phaser/AuraCollision.ts. Each cell holds bit flags:
 *   1 = SOLID   furniture with `blocksMovement` (set from the builder's live layout, not the map)
 *   2 = EDGE_L  wall on the cell's upper-left edge  (between grid x-1 and x)
 *   4 = EDGE_R  wall on the cell's upper-right edge (between grid y-1 and y)
 * Wall edges come from the Tiled map's hidden `collision` layer. Doorways are edges without a flag.
 * Outside the grid counts as solid.
 *
 * Arcade bodies are axis-aligned screen rectangles, which do not fit isometric diamonds, so movement is
 * resolved in grid space: `resolveMove` slides along walls, `findPath` walks around them.
 */

import type { GridPoint } from '../utils/isometric';
import { flattenTileLayers, getTileProperty, resolveGid, type TiledMap } from '../utils/tiled-map';

export const COLL_SOLID = 1;
export const COLL_EDGE_L = 2;
export const COLL_EDGE_R = 4;

export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  /** Wall edge flags from the map. */
  private readonly walls: Uint8Array;
  /** Solid furniture cells from the builder layout. */
  private readonly solids: Uint8Array;

  constructor(width: number, height: number, walls?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.walls = walls ?? new Uint8Array(width * height);
    this.solids = new Uint8Array(width * height);
  }

  /**
   * Reads wall edges from a map's `collision` tile layer (tile property `collision`). SOLID flags in the map
   * are ignored: furniture can be moved by the builder, so solid cells come from `setSolids` instead.
   */
  static fromTiledMap(map: TiledMap, width: number, height: number, layerName = 'collision'): CollisionGrid {
    const walls = new Uint8Array(width * height);
    const layer = flattenTileLayers(map.layers).find((l) => l.name === layerName);
    if (layer?.data) {
      const layerWidth = layer.width ?? map.width;
      for (let i = 0; i < layer.data.length; i++) {
        const tile = resolveGid(map, layer.data[i]);
        if (!tile) continue;
        const x = i % layerWidth;
        const y = Math.floor(i / layerWidth);
        if (x >= width || y >= height) continue;
        const flags = getTileProperty<number>(tile, 'collision') ?? 0;
        walls[y * width + x] = flags & (COLL_EDGE_L | COLL_EDGE_R);
      }
    } else {
      console.warn(`[CollisionGrid] Map has no "${layerName}" layer; walls will not block movement.`);
    }
    return new CollisionGrid(width, height, walls);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Combined flags of a cell; out of bounds is SOLID. */
  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return COLL_SOLID;
    const i = y * this.width + x;
    return this.walls[i] | (this.solids[i] ? COLL_SOLID : 0);
  }

  /** Replaces all solid furniture cells. */
  setSolids(cells: Iterable<GridPoint>): void {
    this.solids.fill(0);
    for (const { gx, gy } of cells) {
      if (this.inBounds(gx, gy)) this.solids[gy * this.width + gx] = 1;
    }
  }

  isSolid(x: number, y: number): boolean {
    return (this.get(x, y) & COLL_SOLID) !== 0;
  }

  /** Can you step between two cells that touch (orthogonally or diagonally)? */
  canStep(ax: number, ay: number, bx: number, by: number): boolean {
    if (ax === bx && ay === by) return true;
    if (this.isSolid(bx, by)) return false;
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
    if (dx !== 0 && dy !== 0) {
      // Diagonal: allowed if either L-shaped route is open (no corner cutting through walls).
      return this.diagonalRoutes(ax, ay, bx, by) > 0;
    }
    if (dx === 1) return (this.get(bx, by) & COLL_EDGE_L) === 0;
    if (dx === -1) return (this.get(ax, ay) & COLL_EDGE_L) === 0;
    if (dy === 1) return (this.get(bx, by) & COLL_EDGE_R) === 0;
    return (this.get(ax, ay) & COLL_EDGE_R) === 0; // dy === -1
  }

  /** How many of the two L-shaped routes between diagonal neighbours are open (0, 1 or 2). */
  private diagonalRoutes(ax: number, ay: number, bx: number, by: number): number {
    const viaX = this.canStep(ax, ay, bx, ay) && this.canStep(bx, ay, bx, by);
    const viaY = this.canStep(ax, ay, ax, by) && this.canStep(ax, by, bx, by);
    return Number(viaX) + Number(viaY);
  }

  /** Is a straight move from p to q (grid units) free for a body of the given radius? */
  segmentFree(p: GridPoint, q: GridPoint, radius: number): boolean {
    const dist = Math.hypot(q.gx - p.gx, q.gy - p.gy);
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    const offsets: Array<[number, number]> = [
      [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
    ];
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      for (const [ox, oy] of offsets) {
        const ax = Math.floor(p.gx + (q.gx - p.gx) * t0 + ox);
        const ay = Math.floor(p.gy + (q.gy - p.gy) * t0 + oy);
        const bx = Math.floor(p.gx + (q.gx - p.gx) * t1 + ox);
        const by = Math.floor(p.gy + (q.gy - p.gy) * t1 + oy);
        if (!this.canStep(ax, ay, bx, by)) return false;
      }
    }
    return true;
  }

  /**
   * Resolves a move from `from` to `to` (grid units). If the full move is blocked it slides along the
   * grid-x or grid-y component. Returns the allowed position.
   */
  resolveMove(from: GridPoint, to: GridPoint, radius = 0.25): GridPoint {
    if (this.segmentFree(from, to, radius)) return { gx: to.gx, gy: to.gy };
    const xOnly = { gx: to.gx, gy: from.gy };
    if (this.segmentFree(from, xOnly, radius)) return xOnly;
    const yOnly = { gx: from.gx, gy: to.gy };
    if (this.segmentFree(from, yOnly, radius)) return yOnly;
    return { gx: from.gx, gy: from.gy };
  }

  /** The free cell closest to (x, y), searching outward ring by ring. */
  nearestFreeCell(x: number, y: number, maxRadius = 8): GridPoint | null {
    for (let r = 0; r <= maxRadius; r++) {
      let best: GridPoint | null = null;
      let bestDist = Infinity;
      for (let cy = y - r; cy <= y + r; cy++) {
        for (let cx = x - r; cx <= x + r; cx++) {
          if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) !== r) continue;
          if (this.isSolid(cx, cy)) continue;
          const d = Math.hypot(cx - x, cy - y);
          if (d < bestDist) {
            bestDist = d;
            best = { gx: cx, gy: cy };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A* over cells (8-neighbour, respecting wall edges). Returns cell coordinates from the cell after `from`
   * to `to` inclusive, or null if unreachable. `to` should be a free cell.
   */
  findPath(from: GridPoint, to: GridPoint, maxNodes = 4000): GridPoint[] | null {
    const index = (x: number, y: number) => y * this.width + x;
    if (!this.inBounds(from.gx, from.gy) || !this.inBounds(to.gx, to.gy)) return null;
    if (from.gx === to.gx && from.gy === to.gy) return [];

    const goal = index(to.gx, to.gy);
    const start = index(from.gx, from.gy);
    const gScore = new Map<number, number>([[start, 0]]);
    const cameFrom = new Map<number, number>();
    const open: Array<{ i: number; f: number }> = [{ i: start, f: 0 }];
    const closed = new Set<number>();
    const heuristic = (x: number, y: number) => Math.hypot(x - to.gx, y - to.gy);

    while (open.length && closed.size < maxNodes) {
      // Small grids: a linear scan for the lowest f is fine.
      let bestIdx = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[bestIdx].f) bestIdx = k;
      const { i: current } = open.splice(bestIdx, 1)[0];
      if (current === goal) break;
      if (closed.has(current)) continue;
      closed.add(current);

      const cx = current % this.width;
      const cy = Math.floor(current / this.width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.inBounds(nx, ny) || !this.canStep(cx, cy, nx, ny)) continue;
          // Paths only cut a corner when both sides are open, so a walker's radius never clips it.
          if (dx && dy && this.diagonalRoutes(cx, cy, nx, ny) < 2) continue;
          const next = index(nx, ny);
          if (closed.has(next)) continue;
          const tentative = (gScore.get(current) ?? Infinity) + (dx && dy ? Math.SQRT2 : 1);
          if (tentative < (gScore.get(next) ?? Infinity)) {
            gScore.set(next, tentative);
            cameFrom.set(next, current);
            open.push({ i: next, f: tentative + heuristic(nx, ny) });
          }
        }
      }
    }

    if (!cameFrom.has(goal)) return null;
    const path: GridPoint[] = [];
    for (let node = goal; node !== start; node = cameFrom.get(node)!) {
      path.push({ gx: node % this.width, gy: Math.floor(node / this.width) });
    }
    return path.reverse();
  }
}
