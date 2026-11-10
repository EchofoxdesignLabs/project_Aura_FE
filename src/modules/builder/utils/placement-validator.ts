/**
 * Placement Validator — Determines if a furniture item can be legally placed.
 *
 * Pure function, no Phaser or Zustand dependencies.
 * Used by:
 *   - BuilderStore.updateGhostPosition() to set ghostValid
 *   - BuilderStore.placeItem() as a final guard
 *   - BuilderStore.moveItem() to validate the destination
 */

import { OccupancyGrid } from '../state/occupancy-grid';

// ─── Validation Result ───

export interface PlacementValidation {
  isValid: boolean;
  reason?: PlacementInvalidReason;
  /** Instance IDs of items that would be overlapped. */
  conflictingItemIds?: string[];
}

export type PlacementInvalidReason =
  | 'OUT_OF_BOUNDS'
  | 'CELL_OCCUPIED'
  | 'FOOTPRINT_TOO_LARGE';

// ─── Validator ───

/**
 * Validates whether a furniture item can be placed at (gx, gy) with the
 * given (already-rotated) footprint.
 *
 * @param gx              Grid column of the top-left cell
 * @param gy              Grid row of the top-left cell
 * @param footprint       Resolved footprint [cols, rows] after rotation
 * @param grid            The current occupancy grid
 * @param excludeInstanceId  Optional: exclude this instance from occupancy checks
 *                           (used for move operations where the item is being moved)
 */
export function validatePlacement(
  gx: number,
  gy: number,
  footprint: [number, number],
  grid: OccupancyGrid,
  excludeInstanceId?: string,
): PlacementValidation {
  const [cols, rows] = footprint;

  // 1. Footprint size guard (max 4×4)
  if (cols > 4 || rows > 4) {
    return { isValid: false, reason: 'FOOTPRINT_TOO_LARGE' };
  }

  // 2. Bounds check — every cell must be within the grid
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (!grid.isInBounds(gx + col, gy + row)) {
        return { isValid: false, reason: 'OUT_OF_BOUNDS' };
      }
    }
  }

  // 3. Occupancy check — every cell must be free (or belong to excludeInstanceId)
  const conflicting = new Set<string>();
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const occupant = grid.getAt(gx + col, gy + row);
      if (occupant !== null && occupant !== excludeInstanceId) {
        conflicting.add(occupant);
      }
    }
  }

  if (conflicting.size > 0) {
    return {
      isValid: false,
      reason: 'CELL_OCCUPIED',
      conflictingItemIds: [...conflicting],
    };
  }

  return { isValid: true };
}
