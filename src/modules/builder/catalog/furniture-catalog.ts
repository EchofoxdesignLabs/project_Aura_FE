/**
 * Furniture Catalog — Type definitions and enums.
 *
 * Defines the data contracts for the furniture system:
 *   - FurnitureCategory: grouping for catalog UI filtering
 *   - FurnitureDefinition: everything needed to render, place, and validate a furniture item
 *   - PlacedFurnitureItem: a specific instance placed on the grid (serializable)
 *
 * These types are Phaser-agnostic — they describe DATA, not visuals.
 * The visual layer (FurnitureSprite, BuilderOverlayScene) reads these to decide
 * what to draw and where.
 */

// ─── Categories ───

export enum FurnitureCategory {
  DESK = 'DESK',
  CHAIR = 'CHAIR',
  TABLE = 'TABLE',
  DECORATION = 'DECORATION',
  WALL = 'WALL',
  PLANT = 'PLANT',
  ELECTRONICS = 'ELECTRONICS',
  STORAGE = 'STORAGE',
}

/** Human-readable labels for each category (used in the catalog UI). */
export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  [FurnitureCategory.DESK]: 'Desks',
  [FurnitureCategory.CHAIR]: 'Chairs',
  [FurnitureCategory.TABLE]: 'Tables',
  [FurnitureCategory.DECORATION]: 'Decorations',
  [FurnitureCategory.WALL]: 'Walls & Dividers',
  [FurnitureCategory.PLANT]: 'Plants',
  [FurnitureCategory.ELECTRONICS]: 'Electronics',
  [FurnitureCategory.STORAGE]: 'Storage',
};

// ─── Furniture Definition (Catalog Entry) ───

export interface FurnitureDefinition {
  /** Unique catalog ID (e.g., 'desk-standard-01'). Stable across versions. */
  id: string;

  /** Display name in the builder UI. */
  name: string;

  /** Category for catalog filtering. */
  category: FurnitureCategory;

  /**
   * Grid footprint in tiles [columns, rows] at rotation 0°.
   * Max 4×4 as per design decision.
   * Example: a standard desk is [2, 1] — 2 tiles wide, 1 tile deep.
   */
  footprint: [number, number];

  /**
   * Key of the generated placeholder texture, used only when the item has no sprite sheet from the art
   * pipeline. Real art, canvas size and anchor come from the manifest (see furniture-art.ts).
   */
  textureKey: string;

  /**
   * Whether this item blocks avatar movement (marks its cells solid in the collision grid).
   * Desks, walls, and storage typically block. Chairs, plants and decorations do not.
   */
  blocksMovement: boolean;

  /**
   * 'surface' items (monitors, laptops, mugs — Asset Rulebook R-26) sit on top of a host item instead of the
   * floor. They do not take floor cells and are drawn lifted by the host's `surfaceHeight`. Default 'floor'.
   */
  placement?: 'floor' | 'surface';

  /** Height in art pixels of this item's top surface, if surface items may be placed on it (desks, tables). */
  surfaceHeight?: number;

  /**
   * Allowed rotations in degrees. Typically [0, 90, 180, 270] for square items,
   * [0, 180] for symmetric items, or [0] for items that don't rotate.
   */
  allowedRotations: number[];

  /**
   * Path under public/ to a 64×64 thumbnail PNG for the React catalog panel, without a leading slash
   * (resolve it with `assetUrl`). Example: 'assets/furniture/thumbnails/desk-standard-01.png'
   */
  thumbnailUrl: string;

  /**
   * If placing this furniture item should auto-associate it with a zone type.
   * For example, placing a 'desk' could auto-create a PRIVATE_DESK zone.
   * null means no zone association. Deferred for MVP — all items are standalone.
   */
  associatedZoneType: string | null;
}

// ─── Placed Instance (Runtime State) ───

export interface PlacedFurnitureItem {
  /** Unique instance ID (UUID). Generated client-side on placement. */
  instanceId: string;

  /** References a FurnitureDefinition.id from the catalog. */
  catalogId: string;

  /** Grid column of the top-left cell of the item's footprint. */
  gridX: number;

  /** Grid row of the top-left cell of the item's footprint. */
  gridY: number;

  /** Current rotation in degrees (0, 90, 180, or 270). */
  rotation: number;
}

// ─── Helpers ───

/**
 * Returns the footprint [cols, rows] after applying rotation.
 * 90° and 270° swap columns and rows.
 */
export function getRotatedFootprint(
  footprint: [number, number],
  rotation: number,
): [number, number] {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return [footprint[1], footprint[0]];
  }
  return [footprint[0], footprint[1]];
}

/**
 * Returns all grid cells occupied by an item placed at (gx, gy)
 * with the given (already-rotated) footprint.
 */
export function getCellsOccupied(
  gx: number,
  gy: number,
  footprint: [number, number],
): { gx: number; gy: number }[] {
  const cells: { gx: number; gy: number }[] = [];
  for (let col = 0; col < footprint[0]; col++) {
    for (let row = 0; row < footprint[1]; row++) {
      cells.push({ gx: gx + col, gy: gy + row });
    }
  }
  return cells;
}

export function isSurfaceItem(definition: Pick<FurnitureDefinition, 'placement'>): boolean {
  return definition.placement === 'surface';
}

/** Maximum allowed footprint dimension (per design decision). */
export const MAX_FOOTPRINT_SIZE = 4;
