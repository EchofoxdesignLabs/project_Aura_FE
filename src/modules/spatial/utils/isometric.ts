import type { OfficeLayoutMetadata, ZoneSnapshot } from '@core/types';

/**
 * Isometric projection utilities — pure functions, no Phaser dependency.
 *
 * Coordinate systems:
 *   - **Grid** (logical): tile column/row, integer or fractional. Cell (x, y) spans grid [x, x+1] × [y, y+1].
 *   - **Screen** (pixel): the 2D world position after isometric projection, at 1× zoom.
 *
 * The standard 2:1 isometric transform is used:
 *   screenX = (gridX - gridY) * (tileWidth / 2) + originX
 *   screenY = (gridX + gridY) * (tileHeight / 2) + originY
 *
 * gridToScreen(x, y) of an integer point is the **top vertex** of cell (x, y). This matches Tiled's isometric
 * maps and the Aura Asset Rulebook, where a furniture anchor is the top tip of its footprint (R-20).
 */

/** Tile size of all Aura art (Asset Rulebook R-01). Pixel sizes are a rendering concern only. */
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

/** Space above the grid's top vertex for back walls (128 px + 6 px cap, R-30) and tall items against them. */
const WALL_HEADROOM = 160;
/** Space left/right of the grid and below it, so edge sprites are not clipped by the world bounds. */
const SIDE_MARGIN = 32;
const BOTTOM_MARGIN = 48;

export interface IsoLayout {
  tileWidth: number;
  tileHeight: number;
  /** Screen position of the grid's top vertex, grid (0, 0). */
  originX: number;
  originY: number;
}

export interface ScreenPoint {
  sx: number;
  sy: number;
}

export interface GridPoint {
  gx: number;
  gy: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ─── Core transforms ───

export function gridToScreen(gx: number, gy: number, layout: IsoLayout): ScreenPoint {
  const halfW = layout.tileWidth / 2;
  const halfH = layout.tileHeight / 2;
  return {
    sx: (gx - gy) * halfW + layout.originX,
    sy: (gx + gy) * halfH + layout.originY,
  };
}

export function screenToGrid(sx: number, sy: number, layout: IsoLayout): GridPoint {
  const halfW = layout.tileWidth / 2;
  const halfH = layout.tileHeight / 2;
  const dx = sx - layout.originX;
  const dy = sy - layout.originY;
  return {
    gx: (dx / halfW + dy / halfH) / 2,
    gy: (dy / halfH - dx / halfW) / 2,
  };
}

// ─── Layout from office metadata ───

/**
 * Builds the projection for an office. The tile size is always the art's 64 × 32 (R-01): the office's
 * stored tileWidth/tileHeight are ignored so older offices seeded with 96 × 48 still line up with the art.
 */
export function buildIsoLayout(meta: Pick<OfficeLayoutMetadata, 'gridWidth' | 'gridHeight'>): IsoLayout {
  return {
    tileWidth: TILE_WIDTH,
    tileHeight: TILE_HEIGHT,
    // The left-most grid point is (0, gridHeight), so the top vertex sits gridHeight half-tiles from the left.
    originX: (meta.gridHeight * TILE_WIDTH) / 2 + SIDE_MARGIN,
    originY: WALL_HEADROOM,
  };
}

/** Total pixel size of the world: the grid diamond plus wall headroom and margins. */
export function getIsoCanvasSize(
  meta: Pick<OfficeLayoutMetadata, 'gridWidth' | 'gridHeight'>,
): { width: number; height: number } {
  const span = meta.gridWidth + meta.gridHeight;
  return {
    width: span * (TILE_WIDTH / 2) + SIDE_MARGIN * 2,
    height: WALL_HEADROOM + span * (TILE_HEIGHT / 2) + BOTTOM_MARGIN,
  };
}

// ─── Diamond polygon helpers ───

/** The 4 screen-space vertices of cell (gx, gy): top, right, bottom, left. */
export function tileDiamond(gx: number, gy: number, layout: IsoLayout): ScreenPoint[] {
  return [
    gridToScreen(gx, gy, layout),
    gridToScreen(gx + 1, gy, layout),
    gridToScreen(gx + 1, gy + 1, layout),
    gridToScreen(gx, gy + 1, layout),
  ];
}

/** Screen-space polygon for a rectangular grid zone (x, y, width, height in grid units). */
export function zoneDiamond(zone: ZoneSnapshot, layout: IsoLayout): ScreenPoint[] {
  const { x, y, width, height } = zone;
  return [
    gridToScreen(x, y, layout),                   // top vertex
    gridToScreen(x + width, y, layout),           // right vertex
    gridToScreen(x + width, y + height, layout),  // bottom vertex
    gridToScreen(x, y + height, layout),          // left vertex
  ];
}

/** Center screen point of a zone. */
export function zoneCenter(zone: ZoneSnapshot, layout: IsoLayout): ScreenPoint {
  return gridToScreen(zone.x + zone.width / 2, zone.y + zone.height / 2, layout);
}

// ─── Depth sorting ───
//
// Every world object gets a **sort key**: gx + gy of its front-most ground point (the bottom vertex of a
// footprint, the feet of an avatar). Higher keys draw later. Depth bands keep the floor, decals and
// screen-space labels out of the sorted range. `DepthSorter` refines avatar depth against furniture and walls.

export const DEPTH = {
  FLOOR: 0,
  ZONE_FILL: 2,
  DECAL: 5,
  /** Sorted world objects start here: depth = WORLD + key × 10. */
  WORLD: 100,
  ZONE_LABEL: 50_000,
  NAME_TAG: 60_000,
  DEBUG: 100_000,
} as const;

/** Phaser depth for a sort key. */
export function depthForKey(key: number): number {
  return DEPTH.WORLD + key * 10;
}

/** Sort key of a footprint: gx + gy of its bottom vertex (Asset Rulebook R-22, "sorted by its front-most tile"). */
export function footprintSortKey(gx: number, gy: number, footprint: [number, number]): number {
  return gx + footprint[0] + gy + footprint[1];
}

// ─── Hit-testing ───

/** Point-in-polygon test using ray-casting. Works for the diamond polygons above. */
export function isPointInPolygon(px: number, py: number, polygon: ScreenPoint[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].sx;
    const yi = polygon[i].sy;
    const xj = polygon[j].sx;
    const yj = polygon[j].sy;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// ─── Furniture placement helpers ───

/** Snaps a screen coordinate to the grid cell that contains it. */
export function snapToGrid(sx: number, sy: number, layout: IsoLayout): GridPoint {
  const raw = screenToGrid(sx, sy, layout);
  return {
    gx: Math.floor(raw.gx),
    gy: Math.floor(raw.gy),
  };
}

/**
 * Screen-space diamond for a multi-cell footprint covering cells (gx, gy) to (gx + cols - 1, gy + rows - 1).
 */
export function furnitureDiamond(
  gx: number,
  gy: number,
  footprint: [number, number],
  layout: IsoLayout,
): ScreenPoint[] {
  const [cols, rows] = footprint;
  return [
    gridToScreen(gx, gy, layout),                  // top vertex
    gridToScreen(gx + cols, gy, layout),            // right vertex
    gridToScreen(gx + cols, gy + rows, layout),     // bottom vertex
    gridToScreen(gx, gy + rows, layout),            // left vertex
  ];
}

/**
 * Screen bounds of an object standing on a footprint: the footprint diamond extended upward by its height.
 * `lift` raises the whole object (surface props on a desk).
 */
export function footprintScreenRect(
  gx: number,
  gy: number,
  footprint: [number, number],
  height: number,
  layout: IsoLayout,
  lift = 0,
): ScreenRect {
  const [top, right, bottom, left] = furnitureDiamond(gx, gy, footprint, layout);
  return {
    left: left.sx,
    right: right.sx,
    top: top.sy - height - lift,
    bottom: bottom.sy - lift,
  };
}
