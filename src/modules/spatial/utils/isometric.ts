import type { OfficeLayoutMetadata, ZoneSnapshot } from '@core/types';

/**
 * Isometric projection utilities — pure functions, no Phaser dependency.
 *
 * Coordinate systems:
 *   - **Grid** (logical): integer tile column/row or fractional position.
 *   - **Screen** (pixel): the 2D canvas position after isometric projection.
 *
 * The standard 2:1 isometric transform is used:
 *   screenX = (gridX - gridY) * (tileWidth / 2) + originX
 *   screenY = (gridX + gridY) * (tileHeight / 2) + originY
 */

export interface IsoLayout {
  tileWidth: number;
  tileHeight: number;
  /** Pixel offset for the top-center origin of the isometric grid. */
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

export function buildIsoLayout(meta: OfficeLayoutMetadata): IsoLayout {
  const originX = (meta.gridWidth * meta.tileWidth) / 2;
  const originY = meta.tileHeight; // small top margin
  return {
    tileWidth: meta.tileWidth,
    tileHeight: meta.tileHeight,
    originX,
    originY,
  };
}

/** Total pixel canvas size required for the full isometric grid. */
export function getIsoCanvasSize(meta: OfficeLayoutMetadata): { width: number; height: number } {
  return {
    width: (meta.gridWidth + meta.gridHeight) * (meta.tileWidth / 2),
    height: (meta.gridWidth + meta.gridHeight) * (meta.tileHeight / 2) + meta.tileHeight * 2,
  };
}

// ─── Diamond polygon helpers ───

/** Returns the 4 screen-space vertices of a single tile diamond. */
export function tileDiamond(gx: number, gy: number, layout: IsoLayout): ScreenPoint[] {
  const { sx, sy } = gridToScreen(gx, gy, layout);
  const halfW = layout.tileWidth / 2;
  const halfH = layout.tileHeight / 2;
  return [
    { sx, sy: sy - halfH },           // top
    { sx: sx + halfW, sy },            // right
    { sx, sy: sy + halfH },            // bottom
    { sx: sx - halfW, sy },            // left
  ];
}

/** Returns screen-space polygon for a rectangular grid zone (x,y,w,h in grid coords). */
export function zoneDiamond(zone: ZoneSnapshot, layout: IsoLayout): ScreenPoint[] {
  const { x, y, width, height } = zone;
  // The 4 corners of a grid-aligned rectangle in iso projection
  return [
    gridToScreen(x, y, layout),                       // top-left corner → top vertex
    gridToScreen(x + width, y, layout),                // top-right → right vertex
    gridToScreen(x + width, y + height, layout),       // bottom-right → bottom vertex
    gridToScreen(x, y + height, layout),               // bottom-left → left vertex
  ];
}

/** Center screen point of a zone. */
export function zoneCenter(zone: ZoneSnapshot, layout: IsoLayout): ScreenPoint {
  return gridToScreen(zone.x + zone.width / 2, zone.y + zone.height / 2, layout);
}

// ─── Depth sorting ───

/** Depth value for a grid position — higher means rendered later (in front). */
export function isoDepth(gx: number, gy: number): number {
  return gx + gy;
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

// ─── Furniture placement helpers ───

/**
 * Snaps a screen coordinate to the nearest integer grid cell.
 * Used by the builder to snap the ghost cursor to the grid.
 */
export function snapToGrid(sx: number, sy: number, layout: IsoLayout): GridPoint {
  const raw = screenToGrid(sx, sy, layout);
  return {
    gx: Math.floor(raw.gx),
    gy: Math.floor(raw.gy),
  };
}

/**
 * Returns the screen-space bounding diamond for a multi-cell furniture item.
 * The diamond covers all cells from (gx, gy) to (gx + cols, gy + rows).
 * This is essentially a zone diamond for the furniture's footprint.
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
 * Calculates the correct iso-sort depth for a furniture item.
 * Based on the bottom-most occupied cell (highest gx + gy sum)
 * so the item sorts correctly relative to players walking around it.
 *
 * @param gx        Grid column of the top-left cell
 * @param gy        Grid row of the top-left cell
 * @param footprint Resolved (already rotated) footprint [cols, rows]
 * @param depthOffset Extra depth offset from the FurnitureDefinition
 * @returns Depth value for Phaser's setDepth()
 */
export function furnitureDepth(
  gx: number,
  gy: number,
  footprint: [number, number],
  depthOffset: number = 0,
): number {
  // Bottom-most cell is at (gx + cols - 1, gy + rows - 1)
  const bottomGx = gx + footprint[0] - 1;
  const bottomGy = gy + footprint[1] - 1;
  return 10 + isoDepth(bottomGx, bottomGy) * 2 + depthOffset;
}

/**
 * Returns the screen center of a furniture item's footprint.
 * Useful for placing labels or selection indicators.
 */
export function furnitureCenter(
  gx: number,
  gy: number,
  footprint: [number, number],
  layout: IsoLayout,
): ScreenPoint {
  return gridToScreen(
    gx + footprint[0] / 2,
    gy + footprint[1] / 2,
    layout,
  );
}

