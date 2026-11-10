/**
 * Furniture art — sprite sheets from the Aura_Assets pipeline (Asset Rulebook R-15, R-19 to R-27).
 *
 * `furniture.manifest.json` is written by `npm run assets:sync` from Aura_Assets/export/furniture. Each sheet
 * holds one column per drawn view and one row per layer:
 *
 *        view-se   view-nw            (+ view-sw, view-ne when mirror: false)
 *   row 0  base      base
 *   row 1  front     front           (seats only, R-24)
 *
 * Canvas = (cols + rows)·32 × (cols + rows)·16 + height. The anchor is the footprint's top tip at floor level,
 * so a sprite is placed with its anchor on gridToScreen(gridX, gridY) and needs no hand-tuned offsets.
 *
 * Rotations: 0° = view-se, 180° = view-nw; 90° and 270° are view-se and view-nw mirrored, unless the item
 * draws all four views.
 */

import Phaser from 'phaser';
import { assetUrl } from '@core/utils/asset-url';
import manifest from './furniture.manifest.json';

export interface FurnitureArt {
  id: string;
  name: string;
  /** Footprint [cols, rows] at rotation 0. */
  footprint: [number, number];
  /** Art pixels from the floor to the top of the object (R-10, R-11). */
  height: number;
  /** Canvas size of one view, [width, height]. */
  canvas: [number, number];
  /** Footprint top tip within the canvas, [x, y]. */
  anchor: [number, number];
  /** Where a seated avatar's feet go, within the canvas (seats only). */
  seat?: [number, number];
  views: string[];
  /** Layers, back to front: ['art'] or ['base', 'front'] for seats. */
  layers: string[];
  mirror: boolean;
  /** Rugs and floor markings: always under furniture and avatars (R-27). */
  decal: boolean;
}

interface ManifestFile {
  items: Array<Omit<FurnitureArt, 'footprint' | 'canvas' | 'anchor' | 'seat'> & {
    footprint: number[];
    canvas: number[];
    anchor: number[];
    seat?: number[];
  }>;
}

const pair = (v: number[]): [number, number] => [v[0], v[1]];

const ART = new Map<string, FurnitureArt>(
  (manifest as ManifestFile).items.map((item) => [
    item.id,
    {
      ...item,
      footprint: pair(item.footprint),
      canvas: pair(item.canvas),
      anchor: pair(item.anchor),
      seat: item.seat ? pair(item.seat) : undefined,
    },
  ]),
);

/** Items at least this tall fade when they hide your own avatar (R-35). */
export const TALL_ITEM_HEIGHT = 64;

export function getFurnitureArt(catalogId: string): FurnitureArt | undefined {
  return ART.get(catalogId);
}

export function furnitureSheetKey(catalogId: string): string {
  return `furniture-sheet:${catalogId}`;
}

export function furnitureThumbnailUrl(catalogId: string): string {
  return assetUrl(`assets/furniture/thumbnails/${catalogId}.png`);
}

/** Queues every furniture sheet in the manifest. Call from a scene's preload(). */
export function preloadFurnitureArt(scene: Phaser.Scene): void {
  for (const art of ART.values()) {
    const key = furnitureSheetKey(art.id);
    if (scene.textures.exists(key)) continue;
    scene.load.spritesheet(key, assetUrl(`assets/furniture/sheets/${art.id}.png`), {
      frameWidth: art.canvas[0],
      frameHeight: art.canvas[1],
    });
  }
}

/** True when the item's sheet is loaded (otherwise the placeholder texture is used). */
export function hasFurnitureSheet(scene: Phaser.Scene, catalogId: string): boolean {
  return ART.has(catalogId) && scene.textures.exists(furnitureSheetKey(catalogId));
}

export interface FurnitureView {
  /** Sheet frame index per layer, back to front. */
  frames: number[];
  flipX: boolean;
  /** Origin that puts the footprint's top tip on the sprite position, accounting for the flip. */
  originX: number;
  originY: number;
}

const VIEW_FOR_ROTATION: Record<number, string> = { 0: 'view-se', 90: 'view-sw', 180: 'view-nw', 270: 'view-ne' };
const MIRROR_SOURCE: Record<number, string> = { 90: 'view-se', 270: 'view-nw' };

/** Which frames to draw for a rotation, and how to place them. */
export function resolveFurnitureView(art: FurnitureArt, rotation: number): FurnitureView {
  const normalized = (((rotation % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const wanted = VIEW_FOR_ROTATION[normalized] ?? 'view-se';

  let viewIndex = art.views.indexOf(wanted);
  let flipX = false;
  if (viewIndex < 0) {
    viewIndex = Math.max(0, art.views.indexOf(MIRROR_SOURCE[normalized] ?? 'view-se'));
    flipX = normalized === 90 || normalized === 270;
  }

  const columns = art.views.length;
  const frames = art.layers.map((_, layerIndex) => layerIndex * columns + viewIndex);

  const [width, height] = art.canvas;
  const anchorX = flipX ? width - art.anchor[0] : art.anchor[0];
  return { frames, flipX, originX: anchorX / width, originY: art.anchor[1] / height };
}
