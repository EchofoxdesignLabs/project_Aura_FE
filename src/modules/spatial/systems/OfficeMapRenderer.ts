import Phaser from 'phaser';
import { assetUrl } from '@core/utils/asset-url';
import {
  DEPTH,
  depthForKey,
  gridToScreen,
  tileDiamond,
  type IsoLayout,
} from '../utils/isometric';
import {
  flattenTileLayers,
  getTileProperty,
  mapCacheKey,
  resolveGid,
  tilesetTextureKey,
  type TiledMap,
} from '../utils/tiled-map';
import { CollisionGrid } from './CollisionGrid';
import type { DepthSorter, Occluder } from './DepthSorter';

/**
 * OfficeMapRenderer — draws an office's Tiled map (floors and walls) and builds its collision grid.
 *
 * Maps live in `public/assets/maps/<mapKey>.tmj` (copied by `npm run assets:sync`). The office's `mapKey`
 * comes from the backend. Offices without a map get a plain tiled floor and no walls.
 */

/** Sort key offset of a wall tile: after its own cell's back edges, before anything standing in the cell. */
const WALL_KEY_OFFSET = 1.5;
/** Thickness of a wall's ground box, in grid units (walls stand on tile edges, R-29). */
const WALL_THICKNESS = 0.05;

/** Queues the map JSON and, once it arrives, every single-image tileset it references. Call from preload(). */
export function preloadOfficeMap(scene: Phaser.Scene, mapKey: string): void {
  const jsonKey = mapCacheKey(mapKey);
  const mapUrl = assetUrl(`assets/maps/${mapKey}.tmj`);

  const queueTilesets = (map: TiledMap) => {
    for (const tileset of map.tilesets) {
      if (!tileset.image) continue; // image collections (furniture) are not drawn from the map
      const key = tilesetTextureKey(mapKey, tileset.name);
      if (scene.textures.exists(key)) continue;
      scene.load.spritesheet(key, new URL(tileset.image, new URL(mapUrl, window.location.href)).href, {
        frameWidth: tileset.tilewidth,
        frameHeight: tileset.tileheight,
      });
    }
  };

  const cached = scene.cache.json.get(jsonKey) as TiledMap | undefined;
  if (cached) {
    queueTilesets(cached);
    return;
  }

  scene.load.once(`filecomplete-json-${jsonKey}`, (_key: string, _type: string, data: TiledMap) => {
    queueTilesets(data);
  });
  scene.load.json(jsonKey, mapUrl);
}

export interface RenderedOfficeMap {
  collision: CollisionGrid;
  /** Map background colour (shown outside the walls), if the map sets one. */
  backgroundColor: string | null;
}

/**
 * Draws the map and registers its walls with the depth sorter. Falls back to a plain floor when the map is
 * missing or failed to load.
 */
export function renderOfficeMap(
  scene: Phaser.Scene,
  mapKey: string | null | undefined,
  layout: IsoLayout,
  gridWidth: number,
  gridHeight: number,
  sorter: DepthSorter,
): RenderedOfficeMap {
  const map = mapKey ? (scene.cache.json.get(mapCacheKey(mapKey)) as TiledMap | undefined) : undefined;

  if (!mapKey || !map) {
    if (mapKey) console.warn(`[OfficeMap] Map "${mapKey}" is not loaded; drawing a plain floor.`);
    drawFallbackFloor(scene, layout, gridWidth, gridHeight);
    return { collision: new CollisionGrid(gridWidth, gridHeight), backgroundColor: null };
  }

  if (map.orientation !== 'isometric' || map.tilewidth !== layout.tileWidth || map.tileheight !== layout.tileHeight) {
    console.warn(
      `[OfficeMap] "${mapKey}" is ${map.orientation} ${map.tilewidth}×${map.tileheight}; ` +
        `the engine expects isometric ${layout.tileWidth}×${layout.tileHeight}.`,
    );
  }
  if (map.width !== gridWidth || map.height !== gridHeight) {
    console.warn(
      `[OfficeMap] "${mapKey}" is ${map.width}×${map.height} tiles but the office grid is ` +
        `${gridWidth}×${gridHeight}. Reseed the office or fix the map.`,
    );
  }

  const layers = flattenTileLayers(map.layers);
  layers.forEach((layer, layerIndex) => {
    if (!layer.visible || !layer.data) return;
    const layerWidth = layer.width ?? map.width;

    layer.data.forEach((rawGid, i) => {
      const tile = resolveGid(map, rawGid);
      if (!tile) return;
      const textureKey = tilesetTextureKey(mapKey, tile.tileset.name);
      if (!scene.textures.exists(textureKey)) return;

      const x = i % layerWidth;
      const y = Math.floor(i / layerWidth);
      const top = gridToScreen(x, y, layout);
      const offset = tile.tileset.tileoffset ?? { x: 0, y: 0 };

      // Tiled draws an isometric tile bottom-aligned to its cell and centred on it.
      const image = scene.add
        .image(
          top.sx - tile.tileset.tilewidth / 2 + offset.x,
          top.sy + map.tileheight - tile.tileset.tileheight + offset.y,
          textureKey,
          tile.localId,
        )
        .setOrigin(0, 0)
        .setFlipX(tile.flipX)
        .setAlpha(layer.opacity ?? 1);

      const isTall = tile.tileset.tileheight > map.tileheight;
      if (!isTall) {
        image.setDepth(DEPTH.FLOOR + layerIndex * 0.01);
        return;
      }

      const key = x + y + WALL_KEY_OFFSET;
      image.setDepth(depthForKey(key));
      const rect = {
        left: image.x,
        top: image.y,
        right: image.x + image.width,
        bottom: image.y + image.height,
      };
      const edge = getTileProperty<string>(tile, 'edge') ?? '';
      const occluders: Occluder[] = [];
      if (edge.includes('L')) {
        occluders.push({ key, rect, box: { x0: x - WALL_THICKNESS, x1: x, y0: y, y1: y + 1 } });
      }
      if (edge.includes('R')) {
        occluders.push({ key, rect, box: { x0: x, x1: x + 1, y0: y - WALL_THICKNESS, y1: y } });
      }
      if (!occluders.length) {
        occluders.push({ key, rect, box: { x0: x, x1: x + 1, y0: y, y1: y + 1 } });
      }
      sorter.set(`wall:${layer.id}:${x}:${y}`, occluders);
    });
  });

  return {
    collision: CollisionGrid.fromTiledMap(map, gridWidth, gridHeight),
    backgroundColor: map.backgroundcolor ?? null,
  };
}

/** Plain two-tone floor for offices without a map. */
function drawFallbackFloor(scene: Phaser.Scene, layout: IsoLayout, gridWidth: number, gridHeight: number): void {
  const graphics = scene.add.graphics().setDepth(DEPTH.FLOOR);
  for (let gx = 0; gx < gridWidth; gx++) {
    for (let gy = 0; gy < gridHeight; gy++) {
      const diamond = tileDiamond(gx, gy, layout).map((p) => new Phaser.Math.Vector2(p.sx, p.sy));
      graphics.fillStyle((gx + gy) % 2 === 0 ? 0xc9c5b9 : 0xbfbbaf, 1);
      graphics.fillPoints(diamond, true);
      graphics.lineStyle(1, 0xa9a598, 0.6);
      graphics.strokePoints(diamond, true);
    }
  }
}
