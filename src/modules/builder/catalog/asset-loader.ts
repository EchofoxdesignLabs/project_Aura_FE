/**
 * Asset Loader — furniture textures for Phaser and thumbnails for the catalog UI.
 *
 * Real art comes from the Aura_Assets pipeline (see furniture-art.ts, loaded in OfficeScene.preload).
 * Items without a sheet get a generated placeholder box that follows the same canvas and anchor rules
 * (Asset Rulebook R-19, R-20), so the rest of the engine treats both the same way.
 */

import Phaser from 'phaser';
import { DEFAULT_CATALOG } from './default-catalog';
import type { FurnitureDefinition } from './furniture-catalog';
import { furnitureSheetKey, getFurnitureArt, hasFurnitureSheet, type FurnitureArt } from './furniture-art';

// ─── Color palette for placeholder generation (per category) ───

const CATEGORY_COLORS: Record<string, number> = {
  DESK: 0x3b82f6,         // Blue
  CHAIR: 0x8b5cf6,        // Purple
  TABLE: 0xf59e0b,        // Amber
  DECORATION: 0xec4899,   // Pink
  WALL: 0x64748b,         // Slate
  PLANT: 0x22c55e,        // Green
  ELECTRONICS: 0x06b6d4,  // Cyan
  STORAGE: 0xf97316,      // Orange
};

const PLACEHOLDER_HEIGHT = 24;
const HALF_W = 32;
const HALF_H = 16;

/** Canvas, anchor and views of the generated placeholder for an item. */
export function getPlaceholderArt(definition: FurnitureDefinition): FurnitureArt {
  const [cols, rows] = definition.footprint;
  const height = getFurnitureArt(definition.id)?.height ?? PLACEHOLDER_HEIGHT;
  return {
    id: definition.id,
    name: definition.name,
    footprint: [cols, rows],
    height,
    canvas: [(cols + rows) * HALF_W, (cols + rows) * HALF_H + height],
    anchor: [rows * HALF_W, height],
    views: ['view-se'],
    layers: ['art'],
    mirror: true,
    decal: height <= 2,
  };
}

/** Texture key and art description to draw an item with: its sheet if loaded, else the placeholder. */
export function resolveFurnitureTexture(
  scene: Phaser.Scene,
  definition: FurnitureDefinition,
): { textureKey: string; art: FurnitureArt } {
  const art = getFurnitureArt(definition.id);
  if (art && hasFurnitureSheet(scene, definition.id)) {
    return { textureKey: furnitureSheetKey(definition.id), art };
  }
  return { textureKey: definition.textureKey, art: getPlaceholderArt(definition) };
}

/** Draws a shaded isometric box on the rulebook canvas for the item's footprint. */
function generatePlaceholderTexture(scene: Phaser.Scene, definition: FurnitureDefinition): void {
  if (scene.textures.exists(definition.textureKey)) return;

  const art = getPlaceholderArt(definition);
  const [cols, rows] = art.footprint;
  const [width, canvasHeight] = art.canvas;
  const h = art.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const base = CATEGORY_COLORS[definition.category] ?? 0x94a3b8;
  const shade = (k: number) =>
    `rgb(${Math.floor(((base >> 16) & 0xff) * k)}, ${Math.floor(((base >> 8) & 0xff) * k)}, ${Math.floor((base & 0xff) * k)})`;

  // Footprint vertices on the top face (raised by h): top, right, bottom, left.
  const top = { x: rows * HALF_W, y: 0 };
  const right = { x: (rows + cols) * HALF_W, y: cols * HALF_H };
  const bottom = { x: cols * HALF_W, y: (cols + rows) * HALF_H };
  const left = { x: 0, y: rows * HALF_H };

  const poly = (points: Array<{ x: number; y: number }>, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  };
  const down = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + h });

  poly([left, bottom, down(bottom), down(left)], shade(0.75));   // front-left face
  poly([bottom, right, down(right), down(bottom)], shade(0.6));  // front-right face
  poly([top, right, bottom, left], shade(1));                    // top face

  scene.textures.addCanvas(definition.textureKey, canvas);
}

/**
 * Generates placeholder textures for catalog items that have no sprite sheet.
 * Call from OfficeScene.create() after preload, so loaded sheets are known.
 */
export function ensureFurnitureTextures(scene: Phaser.Scene): void {
  for (const definition of DEFAULT_CATALOG) {
    if (!hasFurnitureSheet(scene, definition.id)) {
      generatePlaceholderTexture(scene, definition);
    }
  }
}

/**
 * Generates a 64×64 thumbnail for the React catalog UI, used when the item's thumbnail PNG is missing.
 * Returns a data URL that can be used as an <img> src.
 */
export function generateThumbnailDataUrl(definition: FurnitureDefinition): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const baseColor = CATEGORY_COLORS[definition.category] ?? 0x94a3b8;
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8) & 0xff;
  const b = baseColor & 0xff;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const hw = 24;
  const hh = 14;

  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fill();

  const [cols, rows] = definition.footprint;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${cols}×${rows}`, cx, size - 4);

  return canvas.toDataURL('image/png');
}
