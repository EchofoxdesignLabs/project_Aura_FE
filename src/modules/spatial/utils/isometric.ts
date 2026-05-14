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
