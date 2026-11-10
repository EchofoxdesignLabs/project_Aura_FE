import Phaser from 'phaser';
import { assetUrl } from '@core/utils/asset-url';

/**
 * Avatar sprite sheets and animations (Asset Rulebook R-14, R-36, R-61 to R-63).
 *
 * Sheets are Aseprite exports (`npm run assets:sync` copies them to public/assets/characters). Every tag
 * becomes one Phaser animation keyed `<sheet>:<tag>` (e.g. `avatar-placeholder-01:walk-se`) with the
 * frame durations the artist set. Directions e, sw and ne are not drawn: they play w, se and nw flipped.
 */

export const AVATAR_SHEET = 'avatar-placeholder-01';

/** Frame size and feet pivot (R-36). */
export const AVATAR_FRAME = { width: 64, height: 128 } as const;
export const AVATAR_FEET = { x: 32, y: 120 } as const;
/** Standing head top is 96 px above the feet (R-37). Name tags sit just above it. */
export const AVATAR_HEAD_HEIGHT = 96;

export type Facing = 's' | 'se' | 'e' | 'ne' | 'n' | 'nw' | 'w' | 'sw';
export type AvatarAction = 'idle' | 'walk' | 'sit' | 'work' | 'wave';

/** Directions that play a drawn direction mirrored. */
const MIRRORED: Partial<Record<Facing, Facing>> = { e: 'w', sw: 'se', ne: 'nw' };

/** Tags that hold or play once; everything else loops (R-63). */
const NON_LOOPING = new Set<AvatarAction>(['sit', 'wave']);

interface AsepriteJson {
  frames: Array<{ filename: string; duration: number }> | Record<string, { duration: number }>;
  meta: { frameTags?: Array<{ name: string; from: number; to: number; direction?: string }> };
}

export function preloadAvatarSheets(scene: Phaser.Scene): void {
  if (scene.textures.exists(AVATAR_SHEET)) return;
  scene.load.aseprite(
    AVATAR_SHEET,
    assetUrl(`assets/characters/${AVATAR_SHEET}.png`),
    assetUrl(`assets/characters/${AVATAR_SHEET}.json`),
  );
}

/** Creates `<sheet>:<tag>` animations from the Aseprite JSON. Safe to call more than once. */
export function createAvatarAnimations(scene: Phaser.Scene, sheet = AVATAR_SHEET): void {
  const data = scene.cache.json.get(sheet) as AsepriteJson | undefined;
  if (!data || !scene.textures.exists(sheet)) {
    console.warn(`[Avatar] Sheet "${sheet}" is not loaded; avatars fall back to placeholders.`);
    return;
  }

  const frames = Array.isArray(data.frames)
    ? data.frames
    : Object.entries(data.frames).map(([filename, f]) => ({ filename, duration: f.duration }));

  for (const tag of data.meta.frameTags ?? []) {
    const key = `${sheet}:${tag.name}`;
    if (scene.anims.exists(key)) continue;

    const tagFrames = frames.slice(tag.from, tag.to + 1).map((f) => ({
      key: sheet,
      frame: f.filename,
      duration: f.duration,
    }));
    if (tag.direction === 'reverse') tagFrames.reverse();

    const action = tag.name.split('-')[0] as AvatarAction;
    scene.anims.create({
      key,
      frames: tagFrames,
      // Durations live on the frames; frameRate only matters if a frame has none.
      frameRate: 10,
      repeat: NON_LOOPING.has(action) ? 0 : -1,
      yoyo: tag.direction === 'pingpong',
    });
  }
}

export function hasAvatarSheet(scene: Phaser.Scene, sheet = AVATAR_SHEET): boolean {
  return scene.textures.exists(sheet) && scene.anims.exists(`${sheet}:idle-s`);
}

/** The drawn tag and flip for an action facing a direction, e.g. walk + e → walk-w flipped. */
export function resolveAvatarAnim(
  sheet: string,
  action: AvatarAction,
  facing: Facing,
): { key: string; flipX: boolean } {
  const mirror = MIRRORED[facing];
  return {
    key: `${sheet}:${action}-${mirror ?? facing}`,
    flipX: mirror !== undefined,
  };
}

/**
 * Facing from a screen-space velocity. Screen y is un-squashed 2:1 first, so the iso diagonals (along tile
 * edges, R-17) land in the middle of the se / sw / ne / nw sectors.
 */
export function facingFromVelocity(vx: number, vy: number): Facing | null {
  if (vx === 0 && vy === 0) return null;
  const angle = Math.atan2(vy * 2, vx); // 0 = east, positive = down on screen
  const sector = Math.round(angle / (Math.PI / 4)); // -4 … 4
  switch (sector) {
    case 0: return 'e';
    case 1: return 'se';
    case 2: return 's';
    case 3: return 'sw';
    case 4:
    case -4: return 'w';
    case -3: return 'nw';
    case -2: return 'n';
    default: return 'ne'; // -1
  }
}

/** Walking speed in screen px/s at 1×. The walk cycle plays at the artist's timing at this speed (R-61). */
export const AVATAR_WALK_SPEED = 200;
