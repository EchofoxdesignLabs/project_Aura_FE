import Phaser from 'phaser';
import type { AvatarConfig } from '@core/types';
import { getPreset, type AvatarPreset } from '../utils/avatar-presets';
import { DEPTH, type ScreenRect } from '../utils/isometric';
import {
  AVATAR_FEET,
  AVATAR_FRAME,
  AVATAR_HEAD_HEIGHT,
  AVATAR_SHEET,
  AVATAR_WALK_SPEED,
  facingFromVelocity,
  hasAvatarSheet,
  resolveAvatarAnim,
  type AvatarAction,
  type Facing,
} from './avatar-animations';

/** Remote avatars count as walking above this screen speed (px/s). */
const REMOTE_MOVING_THRESHOLD = 12;
/** Keep walking this long after the last movement, so 15 Hz network updates don't flicker to idle. */
const REMOTE_IDLE_DELAY_MS = 180;

/**
 * PlayerSprite — one avatar in the world.
 *
 * The container sits at the avatar's feet. It holds the engine-drawn shadow (R-42) and the animated body
 * sprite. The name tag is a separate object above the world (depth NAME_TAG) so furniture never hides it;
 * `syncOverlay` keeps it over the head and at screen size.
 *
 * The local player is moved by OfficeScene (grid-space collision) and told its motion via `setMotion`.
 * Remote players interpolate toward network targets and derive their facing from that movement.
 */
export class PlayerSprite extends Phaser.GameObjects.Container {
  public readonly userId: string;
  public readonly isLocal: boolean;

  private targetX: number;
  private targetY: number;

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly bodySprite: Phaser.GameObjects.Sprite | null;
  private readonly fallbackBody: Phaser.GameObjects.Arc | null;
  private readonly tag: Phaser.GameObjects.Container;
  private readonly nameText: Phaser.GameObjects.Text;
  private currentPreset: AvatarPreset;

  private facing: Facing = 's';
  private action: AvatarAction = 'idle';
  private lastMovedAt = 0;
  private prevX: number;
  private prevY: number;

  constructor(
    scene: Phaser.Scene,
    userId: string,
    name: string,
    x: number,
    y: number,
    isLocal: boolean,
    avatarConfig?: AvatarConfig,
  ) {
    super(scene, x, y);

    this.userId = userId;
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;
    this.prevX = x;
    this.prevY = y;
    this.currentPreset = getPreset(avatarConfig?.presetId ?? '');

    // 1. Ground shadow (R-42: 28 × 10, drawn by the engine). The ring shows the user's preset colour.
    this.shadow = scene.add.ellipse(0, 0, 28, 10, 0x000000, 0.28);
    this.shadow.setStrokeStyle(1, this.currentPreset.accentColor, 0.9);
    this.add(this.shadow);

    // 2. Body: the Aseprite sheet, or a coloured placeholder if art failed to load.
    if (hasAvatarSheet(scene)) {
      this.bodySprite = scene.add.sprite(0, 0, AVATAR_SHEET);
      this.bodySprite.setOrigin(AVATAR_FEET.x / AVATAR_FRAME.width, AVATAR_FEET.y / AVATAR_FRAME.height);
      this.add(this.bodySprite);
      this.fallbackBody = null;
      this.playCurrent();
    } else {
      this.bodySprite = null;
      this.fallbackBody = scene.add.circle(0, -18, 16, this.currentPreset.bodyColor);
      this.fallbackBody.setStrokeStyle(2, this.currentPreset.accentColor, 0.8);
      this.add(this.fallbackBody);
    }

    // 3. Name tag (separate object, drawn above the world).
    this.nameText = scene.add
      .text(0, 0, name, {
        fontSize: '11px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        stroke: '#020617',
        strokeThickness: 3,
        fontStyle: '600',
      })
      .setOrigin(0.5, 1);

    const statusDot = scene.add.circle(0, 0, 3.5, 0x10b981).setStrokeStyle(1.5, 0x020617);
    const tagChildren: Phaser.GameObjects.GameObject[] = [this.nameText, statusDot];

    if (isLocal) {
      const youBadge = scene.add
        .text(0, -15, 'You', {
          fontSize: '9px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#06b6d4',
          stroke: '#020617',
          strokeThickness: 2,
          backgroundColor: '#0f172aCC',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 1);
      tagChildren.push(youBadge);
    }

    this.tag = scene.add.container(x, y, tagChildren).setDepth(DEPTH.NAME_TAG);
    statusDot.setPosition(this.nameText.width / 2 + 7, -this.nameText.height / 2);

    scene.add.existing(this);
    this.syncOverlay(scene.cameras.main.zoom);
  }

  /** Called by the PlayerManager when a remote player moves (screen coordinates). */
  public setTargetPosition(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
  }

  /**
   * Local player: the motion OfficeScene applied this frame.
   * @param intentVx/intentVy  what the user asked for (sets facing, even when blocked by a wall)
   * @param speed              screen px/s actually moved (0 when blocked)
   */
  public setMotion(intentVx: number, intentVy: number, speed: number): void {
    const facing = facingFromVelocity(intentVx, intentVy);
    if (facing) this.facing = facing;
    this.setAction(speed > 1 ? 'walk' : 'idle', speed);
  }

  /** Remote players: interpolate toward the network target and animate from the movement. */
  public update(delta: number): void {
    if (this.isLocal) return;

    const lerpFactor = 1 - Math.pow(0.85, delta / 16.67); // ≈ 0.15 per 60 Hz frame
    this.x = Phaser.Math.Linear(this.x, this.targetX, lerpFactor);
    this.y = Phaser.Math.Linear(this.y, this.targetY, lerpFactor);

    const dx = this.x - this.prevX;
    const dy = this.y - this.prevY;
    this.prevX = this.x;
    this.prevY = this.y;

    const speed = delta > 0 ? (Math.hypot(dx, dy) / delta) * 1000 : 0;
    const now = this.scene.time.now;
    if (speed > REMOTE_MOVING_THRESHOLD) {
      const facing = facingFromVelocity(dx, dy);
      if (facing) this.facing = facing;
      this.lastMovedAt = now;
      this.setAction('walk', speed);
    } else if (now - this.lastMovedAt > REMOTE_IDLE_DELAY_MS) {
      this.setAction('idle', 0);
    }
  }

  /** Keeps the name tag over the head and at constant screen size. Call every frame after moving. */
  public syncOverlay(zoom: number): void {
    const scale = 1 / zoom;
    this.tag.setPosition(this.x, this.y - AVATAR_HEAD_HEIGHT - 4);
    this.tag.setScale(scale);
  }

  /** Screen rectangle the body covers (for depth sorting). */
  public getBodyRect(): ScreenRect {
    return {
      left: this.x - 14,
      right: this.x + 14,
      top: this.y - AVATAR_HEAD_HEIGHT,
      bottom: this.y + 4,
    };
  }

  /**
   * Body rectangle without the feet, for R-35 fades: furniture whose bounding box only grazes the feet
   * does not hide the avatar, so it should not fade.
   */
  public getFadeRect(): ScreenRect {
    return { ...this.getBodyRect(), bottom: this.y - 24 };
  }

  /** Update the avatar visual when config changes. */
  public updateAvatarConfig(config: AvatarConfig): void {
    const next = getPreset(config.presetId);
    if (next.id === this.currentPreset.id) return;

    this.currentPreset = next;
    this.shadow.setStrokeStyle(1, next.accentColor, 0.9);
    if (this.fallbackBody) {
      this.fallbackBody.fillColor = next.bodyColor;
      this.fallbackBody.setStrokeStyle(2, next.accentColor, 0.8);
    }
  }

  public destroy(fromScene?: boolean): void {
    this.tag.destroy(fromScene);
    super.destroy(fromScene);
  }

  // ─── Internal ───

  private setAction(action: AvatarAction, speed: number): void {
    const changed = action !== this.action;
    this.action = action;
    this.playCurrent(changed);
    // R-61 #6: walk playback follows movement speed so feet don't slide.
    if (this.bodySprite) {
      this.bodySprite.anims.timeScale = action === 'walk' ? Phaser.Math.Clamp(speed / AVATAR_WALK_SPEED, 0.6, 1.6) : 1;
    }
  }

  private playCurrent(restart = false): void {
    if (!this.bodySprite) return;
    const { key, flipX } = resolveAvatarAnim(AVATAR_SHEET, this.action, this.facing);
    this.bodySprite.setFlipX(flipX);
    if (restart || this.bodySprite.anims.currentAnim?.key !== key) {
      // Keep the walk phase when only the direction changes.
      const progress = !restart && this.bodySprite.anims.isPlaying ? this.bodySprite.anims.getProgress() : 0;
      this.bodySprite.play(key);
      if (progress > 0) this.bodySprite.anims.setProgress(progress);
    }
  }
}
