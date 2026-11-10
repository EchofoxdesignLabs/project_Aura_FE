/**
 * Tiled map (.tmj) types and lookups — only what the engine reads. Pure, no Phaser dependency.
 *
 * Maps come from the Aura_Assets pipeline (`npm run assets:sync`) and must be exported as JSON with
 * embedded tilesets. Conventions the engine relies on (see Aura_Assets/README.md):
 *   - orientation "isometric", tiles 64 × 32, map size = office gridWidth × gridHeight
 *   - tile layers whose tiles are taller than the map tile (walls) are depth-sorted per tile;
 *     flat tile layers (floor) are drawn under everything
 *   - hidden layers are not drawn; the hidden `collision` layer holds bit flags (tile property `collision`)
 *   - wall tiles carry a string property `edge`: 'L' (upper-left edge), 'R' (upper-right edge) or 'LR'
 *   - object layers (furniture, zones, spawn) seed the backend and are not drawn by the engine
 */

export const TILED_FLIP_H = 0x80000000;
const TILED_GID_MASK = 0x1fffffff; // strips the flip / rotation bits

export interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}

export interface TiledTile {
  id: number;
  properties?: TiledProperty[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  /** Present for single-image tilesets; absent for image collections. */
  image?: string;
  imagewidth?: number;
  imageheight?: number;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  tileoffset?: { x: number; y: number };
  tiles?: TiledTile[];
}

export interface TiledLayer {
  id: number;
  name: string;
  type: 'tilelayer' | 'objectgroup' | 'imagelayer' | 'group';
  visible: boolean;
  opacity?: number;
  width?: number;
  height?: number;
  data?: number[];
  layers?: TiledLayer[];
  properties?: TiledProperty[];
}

export interface TiledMap {
  orientation: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  backgroundcolor?: string;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
}

export interface ResolvedTile {
  tileset: TiledTileset;
  /** Tile index inside its tileset (frame index of the tileset image). */
  localId: number;
  flipX: boolean;
}

export function getProperty<T = unknown>(props: TiledProperty[] | undefined, name: string): T | undefined {
  return props?.find((p) => p.name === name)?.value as T | undefined;
}

export function getTileProperty<T = unknown>(tile: ResolvedTile, name: string): T | undefined {
  const entry = tile.tileset.tiles?.find((t) => t.id === tile.localId);
  return getProperty<T>(entry?.properties, name);
}

/** Resolves a layer gid to its tileset and local tile id. Returns null for empty cells. */
export function resolveGid(map: TiledMap, rawGid: number): ResolvedTile | null {
  const gid = rawGid & TILED_GID_MASK;
  if (gid === 0) return null;

  let match: TiledTileset | null = null;
  for (const tileset of map.tilesets) {
    if (tileset.firstgid <= gid && (!match || tileset.firstgid > match.firstgid)) {
      match = tileset;
    }
  }
  if (!match) return null;

  return {
    tileset: match,
    localId: gid - match.firstgid,
    flipX: (rawGid & TILED_FLIP_H) !== 0,
  };
}

/** Tile layers in draw order, with groups flattened. Group visibility is inherited. */
export function flattenTileLayers(layers: TiledLayer[], parentVisible = true): TiledLayer[] {
  const out: TiledLayer[] = [];
  for (const layer of layers) {
    const visible = parentVisible && layer.visible;
    if (layer.type === 'group' && layer.layers) {
      out.push(...flattenTileLayers(layer.layers, visible));
    } else if (layer.type === 'tilelayer' && layer.data) {
      out.push({ ...layer, visible });
    }
  }
  return out;
}

/** Phaser texture key for a tileset image of a given map. */
export function tilesetTextureKey(mapKey: string, tilesetName: string): string {
  return `tileset:${mapKey}:${tilesetName}`;
}

/** Phaser JSON cache key for a map. */
export function mapCacheKey(mapKey: string): string {
  return `map:${mapKey}`;
}
