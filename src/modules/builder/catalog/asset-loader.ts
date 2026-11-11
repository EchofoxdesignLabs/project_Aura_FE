/**
 * Asset Loader — Preloads furniture textures into Phaser.
 *
 * Strategy:
 *   1. Attempts to load real sprite assets from /assets/furniture/
 *   2. On load failure, generates colored isometric placeholder sprites
 *      so the builder works immediately without external art.
 *
 * When professional Aseprite/Tiled assets are placed in the correct
 * directory with matching filenames, they are picked up automatically.
 */

import Phaser from 'phaser';
import { DEFAULT_CATALOG } from './default-catalog';
import type { FurnitureDefinition } from './furniture-catalog';

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

/**
 * Generates a single isometric placeholder sprite as a canvas texture.
 * Draws a filled isometric diamond matching the item's footprint.
 */
function generatePlaceholderTexture(
  scene: Phaser.Scene,
  definition: FurnitureDefinition,
  tileWidth: number,
  tileHeight: number,
): void {
  const key = definition.textureKey;

  // Skip if texture already exists (real asset was loaded)
  if (scene.textures.exists(key)) {
    return;
  }

  const [cols, rows] = definition.footprint;
  const spriteW = (cols + rows) * (tileWidth / 2);
  const spriteH = (cols + rows) * (tileHeight / 2);

  // Add some vertical height for the "3D" look of the placeholder
  const extraHeight = Math.max(definition.depthOffset * 4, 8);
  const totalHeight = spriteH + extraHeight;

  const canvas = document.createElement('canvas');
  canvas.width = spriteW;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const baseColor = CATEGORY_COLORS[definition.category] ?? 0x94a3b8;
  const r = (baseColor >> 16) & 0xff;
  const g = (baseColor >> 8) & 0xff;
  const b = baseColor & 0xff;

  const centerX = spriteW / 2;

  // ─── Draw the "side" face (darker shade) ───
  const sideColor = `rgba(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)}, 0.9)`;
  ctx.fillStyle = sideColor;
  ctx.beginPath();
  ctx.moveTo(centerX, spriteH / 2);                        // right vertex of top
  ctx.lineTo(spriteW, spriteH / 2 + (spriteH / 2 - tileHeight / 4)); // far right
  ctx.lineTo(spriteW, spriteH / 2 + (spriteH / 2 - tileHeight / 4) + extraHeight);
  ctx.lineTo(centerX, spriteH + extraHeight);               // bottom center
  ctx.closePath();
  ctx.fill();

  // ─── Draw the "front" face (medium shade) ───
  const frontColor = `rgba(${Math.floor(r * 0.75)}, ${Math.floor(g * 0.75)}, ${Math.floor(b * 0.75)}, 0.9)`;
  ctx.fillStyle = frontColor;
  ctx.beginPath();
  ctx.moveTo(0, spriteH / 2 + (spriteH / 2 - tileHeight / 4));
  ctx.lineTo(centerX, spriteH);
  ctx.lineTo(centerX, spriteH + extraHeight);
  ctx.lineTo(0, spriteH / 2 + (spriteH / 2 - tileHeight / 4) + extraHeight);
  ctx.closePath();
  ctx.fill();

  // ─── Draw the top face (isometric diamond — lightest shade) ───
  const topColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);                                   // top vertex
  ctx.lineTo(spriteW, spriteH / 2 - tileHeight / 4 + spriteH / 2 - spriteH / 2); // right
  // Simplified: draw a basic diamond
  ctx.moveTo(centerX, spriteH / 2 - spriteH / 2);           // top
  ctx.lineTo(spriteW, spriteH / 2);                          // right
  ctx.lineTo(centerX, spriteH);                              // bottom
  ctx.lineTo(0, spriteH / 2);                                // left
  ctx.closePath();
  ctx.fill();

  // ─── Draw outline ───
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 1)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX, spriteH / 2 - spriteH / 2);
  ctx.lineTo(spriteW, spriteH / 2);
  ctx.lineTo(centerX, spriteH);
  ctx.lineTo(0, spriteH / 2);
  ctx.closePath();
  ctx.stroke();

  // ─── Draw item name text ───
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(10, Math.min(14, tileWidth / 8))}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(definition.name, centerX, spriteH / 2);

  // Register the canvas as a Phaser texture
  scene.textures.addCanvas(key, canvas);
}

/**
 * Generates a 64×64 thumbnail canvas for the React catalog UI.
 * Returns a data URL that can be used as an <img> src.
 */
export function generateThumbnailDataUrl(
  definition: FurnitureDefinition,
): string {
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

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);

  // Draw a small isometric diamond
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

  // Outline
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Footprint label
  const [cols, rows] = definition.footprint;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${cols}×${rows}`, cx, size - 4);

  return canvas.toDataURL('image/png');
}

// ─── Public API ───

/**
 * Call from OfficeScene.create() (after preload) to generate placeholder
 * textures for any furniture items that don't have real assets loaded.
 *
 * @param scene   The active Phaser scene
 * @param tileW   Tile width in pixels (default 96)
 * @param tileH   Tile height in pixels (default 48)
 */
export function ensureFurnitureTextures(
  scene: Phaser.Scene,
  tileW = 96,
  tileH = 48,
): void {
  for (const definition of DEFAULT_CATALOG) {
    generatePlaceholderTexture(scene, definition, tileW, tileH);
  }
}

/**
 * Call from OfficeScene.preload() to attempt loading real furniture assets.
 * Missing files will fallback to placeholder generation in create().
 *
 * Currently a no-op stub — uncomment the atlas/image loads when real
 * assets are added to public/assets/furniture/.
 */
export function preloadFurnitureAssets(scene: Phaser.Scene): void {
  void scene; // used once the loads below are uncommented
  // ─── Atlas loading (when atlas is packed) ───
  // scene.load.atlas(
  //   'office-furniture',
  //   '/assets/furniture/atlases/office-furniture.png',
  //   '/assets/furniture/atlases/office-furniture.json',
  // );

  // ─── Individual image loading ───
  // for (const def of DEFAULT_CATALOG) {
  //   scene.load.image(
  //     def.textureKey,
  //     `/assets/furniture/individual/${def.id}.png`,
  //   );
  // }

  // For MVP, all textures are generated as canvas placeholders in create().
  // This function exists so the preload → create pipeline is already wired.
}
