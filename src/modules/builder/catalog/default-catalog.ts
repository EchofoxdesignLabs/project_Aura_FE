/**
 * Default Furniture Catalog — Starter set of furniture definitions.
 *
 * These definitions use placeholder texture keys that map to programmatically
 * generated sprites (see asset-loader.ts). When professional Aseprite/Tiled
 * assets are ready, swap the textureKey/frameName values — no other code changes.
 *
 * Naming convention: {category}-{style}-{variant}
 *   e.g., desk-standard-01, chair-office-01, plant-potted-01
 */

import {
  FurnitureCategory,
  type FurnitureDefinition,
} from './furniture-catalog';

// ─── Desks ───

const DESKS: FurnitureDefinition[] = [
  {
    id: 'desk-standard-01',
    name: 'Standard Desk',
    category: FurnitureCategory.DESK,
    footprint: [2, 1],
    textureKey: 'furniture-desk-standard-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 0,
    thumbnailUrl: '/assets/furniture/thumbnails/desk-standard-01.png',
    associatedZoneType: null,
  },
  {
    id: 'desk-corner-01',
    name: 'Corner Desk',
    category: FurnitureCategory.DESK,
    footprint: [2, 2],
    textureKey: 'furniture-desk-corner-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 0,
    thumbnailUrl: '/assets/furniture/thumbnails/desk-corner-01.png',
    associatedZoneType: null,
  },
  {
    id: 'desk-standing-01',
    name: 'Standing Desk',
    category: FurnitureCategory.DESK,
    footprint: [1, 1],
    textureKey: 'furniture-desk-standing-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 2,
    thumbnailUrl: '/assets/furniture/thumbnails/desk-standing-01.png',
    associatedZoneType: null,
  },
];

// ─── Chairs ───

const CHAIRS: FurnitureDefinition[] = [
  {
    id: 'chair-office-01',
    name: 'Office Chair',
    category: FurnitureCategory.CHAIR,
    footprint: [1, 1],
    textureKey: 'furniture-chair-office-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: false,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 1,
    thumbnailUrl: '/assets/furniture/thumbnails/chair-office-01.png',
    associatedZoneType: null,
  },
  {
    id: 'chair-lounge-01',
    name: 'Lounge Chair',
    category: FurnitureCategory.CHAIR,
    footprint: [1, 1],
    textureKey: 'furniture-chair-lounge-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: false,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 1,
    thumbnailUrl: '/assets/furniture/thumbnails/chair-lounge-01.png',
    associatedZoneType: null,
  },
];

// ─── Tables ───

const TABLES: FurnitureDefinition[] = [
  {
    id: 'table-conference-01',
    name: 'Conference Table',
    category: FurnitureCategory.TABLE,
    footprint: [3, 2],
    textureKey: 'furniture-table-conference-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90],
    depthOffset: 0,
    thumbnailUrl: '/assets/furniture/thumbnails/table-conference-01.png',
    associatedZoneType: null,
  },
  {
    id: 'table-round-01',
    name: 'Round Table',
    category: FurnitureCategory.TABLE,
    footprint: [2, 2],
    textureKey: 'furniture-table-round-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0],
    depthOffset: 0,
    thumbnailUrl: '/assets/furniture/thumbnails/table-round-01.png',
    associatedZoneType: null,
  },
  {
    id: 'table-coffee-01',
    name: 'Coffee Table',
    category: FurnitureCategory.TABLE,
    footprint: [1, 1],
    textureKey: 'furniture-table-coffee-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90],
    depthOffset: 0,
    thumbnailUrl: '/assets/furniture/thumbnails/table-coffee-01.png',
    associatedZoneType: null,
  },
];

// ─── Decorations ───

const DECORATIONS: FurnitureDefinition[] = [
  {
    id: 'decor-rug-01',
    name: 'Area Rug',
    category: FurnitureCategory.DECORATION,
    footprint: [2, 2],
    textureKey: 'furniture-decor-rug-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: false,
    allowedRotations: [0, 90],
    depthOffset: -5,  // Renders below everything (floor-level)
    thumbnailUrl: '/assets/furniture/thumbnails/decor-rug-01.png',
    associatedZoneType: null,
  },
  {
    id: 'decor-whiteboard-01',
    name: 'Whiteboard',
    category: FurnitureCategory.DECORATION,
    footprint: [2, 1],
    textureKey: 'furniture-decor-whiteboard-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 4,  // Tall item, renders above most things
    thumbnailUrl: '/assets/furniture/thumbnails/decor-whiteboard-01.png',
    associatedZoneType: null,
  },
];

// ─── Plants ───

const PLANTS: FurnitureDefinition[] = [
  {
    id: 'plant-potted-01',
    name: 'Potted Plant',
    category: FurnitureCategory.PLANT,
    footprint: [1, 1],
    textureKey: 'furniture-plant-potted-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: false,
    allowedRotations: [0],
    depthOffset: 2,
    thumbnailUrl: '/assets/furniture/thumbnails/plant-potted-01.png',
    associatedZoneType: null,
  },
  {
    id: 'plant-tall-01',
    name: 'Tall Plant',
    category: FurnitureCategory.PLANT,
    footprint: [1, 1],
    textureKey: 'furniture-plant-tall-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: false,
    allowedRotations: [0],
    depthOffset: 4,
    thumbnailUrl: '/assets/furniture/thumbnails/plant-tall-01.png',
    associatedZoneType: null,
  },
];

// ─── Electronics ───

const ELECTRONICS: FurnitureDefinition[] = [
  {
    id: 'electronics-monitor-01',
    name: 'Monitor',
    category: FurnitureCategory.ELECTRONICS,
    footprint: [1, 1],
    textureKey: 'furniture-electronics-monitor-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: false,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 3,
    thumbnailUrl: '/assets/furniture/thumbnails/electronics-monitor-01.png',
    associatedZoneType: null,
  },
  {
    id: 'electronics-tv-01',
    name: 'TV Screen',
    category: FurnitureCategory.ELECTRONICS,
    footprint: [2, 1],
    textureKey: 'furniture-electronics-tv-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 5,
    thumbnailUrl: '/assets/furniture/thumbnails/electronics-tv-01.png',
    associatedZoneType: null,
  },
];

// ─── Storage ───

const STORAGE: FurnitureDefinition[] = [
  {
    id: 'storage-bookshelf-01',
    name: 'Bookshelf',
    category: FurnitureCategory.STORAGE,
    footprint: [2, 1],
    textureKey: 'furniture-storage-bookshelf-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 5,  // Tall, renders above most items
    thumbnailUrl: '/assets/furniture/thumbnails/storage-bookshelf-01.png',
    associatedZoneType: null,
  },
  {
    id: 'storage-cabinet-01',
    name: 'Filing Cabinet',
    category: FurnitureCategory.STORAGE,
    footprint: [1, 1],
    textureKey: 'furniture-storage-cabinet-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90, 180, 270],
    depthOffset: 2,
    thumbnailUrl: '/assets/furniture/thumbnails/storage-cabinet-01.png',
    associatedZoneType: null,
  },
];

// ─── Walls & Dividers ───

const WALLS: FurnitureDefinition[] = [
  {
    id: 'wall-divider-01',
    name: 'Room Divider',
    category: FurnitureCategory.WALL,
    footprint: [3, 1],
    textureKey: 'furniture-wall-divider-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90],
    depthOffset: 6,
    thumbnailUrl: '/assets/furniture/thumbnails/wall-divider-01.png',
    associatedZoneType: null,
  },
  {
    id: 'wall-partition-01',
    name: 'Glass Partition',
    category: FurnitureCategory.WALL,
    footprint: [2, 1],
    textureKey: 'furniture-wall-partition-01',
    frameName: null,
    anchorOffset: { x: 0, y: 0 },
    blocksMovement: true,
    allowedRotations: [0, 90],
    depthOffset: 5,
    thumbnailUrl: '/assets/furniture/thumbnails/wall-partition-01.png',
    associatedZoneType: null,
  },
];

// ─── Full Catalog ───

export const DEFAULT_CATALOG: FurnitureDefinition[] = [
  ...DESKS,
  ...CHAIRS,
  ...TABLES,
  ...DECORATIONS,
  ...PLANTS,
  ...ELECTRONICS,
  ...STORAGE,
  ...WALLS,
];

// ─── Lookup Helpers ───

const CATALOG_MAP = new Map(DEFAULT_CATALOG.map((item) => [item.id, item]));

/** Get a furniture definition by catalog ID. Returns undefined if not found. */
export function getCatalogItem(catalogId: string): FurnitureDefinition | undefined {
  return CATALOG_MAP.get(catalogId);
}

/** Get all items in a specific category. */
export function getCatalogByCategory(category: FurnitureCategory): FurnitureDefinition[] {
  return DEFAULT_CATALOG.filter((item) => item.category === category);
}

/** Get all unique categories that have at least one item. */
export function getActiveCategories(): FurnitureCategory[] {
  const categories = new Set(DEFAULT_CATALOG.map((item) => item.category));
  return [...categories];
}
