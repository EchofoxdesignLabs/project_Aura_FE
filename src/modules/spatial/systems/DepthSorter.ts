import {
  depthForKey,
  rectsOverlap,
  type ScreenRect,
} from '../utils/isometric';

/**
 * DepthSorter — orders avatars against furniture and walls.
 *
 * Static objects (furniture, wall tiles) register as **occluders**: a grid footprint box, a sort key and their
 * screen bounds. Their own depth is simply `depthForKey(key)` (front-most-tile sorting, Asset Rulebook R-22).
 *
 * A single scalar per object is wrong for an avatar standing beside a long item, so avatar depth is solved
 * against every occluder its sprite overlaps on screen: an avatar whose ground box lies wholly past an
 * occluder's box on either grid axis is in front of it; one wholly before it is behind it. The avatar gets a
 * depth inside that window, as close to its own key as possible.
 *
 * Also handles R-35: tall furniture in front of your own avatar fades to 40 %.
 */

export interface GridBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Occluder {
  box: GridBox;
  key: number;
  rect: ScreenRect;
  /** Called with 0.4 / 1 when the local avatar walks behind it (tall furniture only). */
  setFade?: (faded: boolean) => void;
}

const KEY_EPSILON = 0.01;

export class DepthSorter {
  /** Occluders grouped by owner id (one furniture item or wall tile may register several boxes). */
  private readonly groups = new Map<string, Occluder[]>();
  private readonly faded = new Set<Occluder>();

  set(ownerId: string, occluders: Occluder[]): void {
    this.remove(ownerId);
    if (occluders.length) this.groups.set(ownerId, occluders);
  }

  remove(ownerId: string): void {
    const previous = this.groups.get(ownerId);
    if (!previous) return;
    for (const occluder of previous) {
      if (this.faded.delete(occluder)) occluder.setFade?.(false);
    }
    this.groups.delete(ownerId);
  }

  clear(): void {
    for (const owner of [...this.groups.keys()]) this.remove(owner);
  }

  /**
   * Depth for an avatar whose feet are at grid (gx, gy) and whose sprite covers `rect` on screen.
   * `halfSize` is the avatar's ground half-extent in grid units.
   */
  depthForActor(gx: number, gy: number, rect: ScreenRect, halfSize = 0.25): number {
    const key = gx + gy;
    const actor: GridBox = { x0: gx - halfSize, y0: gy - halfSize, x1: gx + halfSize, y1: gy + halfSize };

    let lower = -Infinity; // must draw after these keys
    let upper = Infinity; // must draw before these keys

    this.forEachOverlapping(rect, (occluder) => {
      const relation = classifyBoxes(actor, occluder.box);
      if (relation === 'front') lower = Math.max(lower, occluder.key);
      else if (relation === 'behind') upper = Math.min(upper, occluder.key);
    });

    if (lower >= upper) return depthForKey(key); // inconsistent neighbours — fall back to the plain key

    let resolved = key;
    if (resolved <= lower) resolved = lower + Math.min(KEY_EPSILON, (upper - lower) / 2);
    if (resolved >= upper) resolved = upper - Math.min(KEY_EPSILON, (upper - lower) / 2);
    return depthForKey(resolved);
  }

  /** Fades fadeable occluders that hide the local avatar (R-35); restores the rest. */
  updateFades(gx: number, gy: number, rect: ScreenRect, halfSize = 0.25): void {
    const actor: GridBox = { x0: gx - halfSize, y0: gy - halfSize, x1: gx + halfSize, y1: gy + halfSize };
    const nowFaded = new Set<Occluder>();

    this.forEachOverlapping(rect, (occluder) => {
      if (occluder.setFade && classifyBoxes(actor, occluder.box) === 'behind') nowFaded.add(occluder);
    });

    for (const occluder of this.faded) {
      if (!nowFaded.has(occluder)) occluder.setFade?.(false);
    }
    for (const occluder of nowFaded) {
      if (!this.faded.has(occluder)) occluder.setFade?.(true);
    }
    this.faded.clear();
    nowFaded.forEach((o) => this.faded.add(o));
  }

  private forEachOverlapping(rect: ScreenRect, fn: (occluder: Occluder) => void): void {
    for (const group of this.groups.values()) {
      for (const occluder of group) {
        if (rectsOverlap(rect, occluder.rect)) fn(occluder);
      }
    }
  }
}

/**
 * Where does box `a` stand relative to box `b` on the floor?
 *   'front'  — a lies past b on some grid axis (closer to the camera)
 *   'behind' — a lies before b on some grid axis
 *   null     — they overlap on the floor, or are separated sideways on screen (no ordering needed)
 */
export function classifyBoxes(a: GridBox, b: GridBox): 'front' | 'behind' | null {
  const inFront = b.x1 <= a.x0 || b.y1 <= a.y0;
  const behind = a.x1 <= b.x0 || a.y1 <= b.y0;
  if (inFront && !behind) return 'front';
  if (behind && !inFront) return 'behind';
  return null;
}
