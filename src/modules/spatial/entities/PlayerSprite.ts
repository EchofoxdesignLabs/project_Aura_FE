import Phaser from 'phaser';
import type { AvatarConfig } from '@core/types';
import { getPreset, type AvatarPreset } from '../utils/avatar-presets';

export class PlayerSprite extends Phaser.GameObjects.Container {
  public readonly userId: string;
  public readonly isLocal: boolean;

  private targetX: number;
  private targetY: number;

  private bodyArc: Phaser.GameObjects.Arc;
  private nameText: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Arc;
  private tokenText: Phaser.GameObjects.Text;
  private currentPreset: AvatarPreset;

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

    // Resolve the avatar preset
    this.currentPreset = getPreset(avatarConfig?.presetId ?? '');
    const bodyColor = this.currentPreset.bodyColor;

    // 1. Create Body Circle (Radius 18)
    this.bodyArc = scene.add.circle(0, 0, 18, bodyColor);
    this.bodyArc.setStrokeStyle(2, this.currentPreset.accentColor, 0.8);

    // 2. Avatar Token inside the circle
    this.tokenText = scene.add
      .text(0, 0, this.currentPreset.token, {
        fontSize: '16px',
        fontFamily: 'system-ui, sans-serif',
      })
      .setOrigin(0.5, 0.5);

    // 3. Create Name Label (Above the player)
    this.nameText = scene.add
      .text(0, -30, name, {
        fontSize: '11px',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        stroke: '#020617',
        strokeThickness: 3,
        fontStyle: '600',
      })
      .setOrigin(0.5, 0.5);

    // 4. "You" badge for local player
    if (isLocal) {
      const youBadge = scene.add
        .text(0, -44, 'You', {
          fontSize: '9px',
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#06b6d4',
          stroke: '#020617',
          strokeThickness: 2,
          backgroundColor: '#0f172aCC',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 0.5);
      this.add(youBadge);
    }

    // 5. Create Status Dot (Green/Online, bottom right of the body)
    this.statusDot = scene.add.circle(13, 13, 4, 0x10b981);
    this.statusDot.setStrokeStyle(1.5, 0x020617);

    // 6. Add all visual elements to the Container
    this.add([this.bodyArc, this.tokenText, this.nameText, this.statusDot]);

    // 7. Add Container to Scene & Enable Physics
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 8. Configure Physics Body
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(18, -18, -18);
    body.setCollideWorldBounds(true);

    // Remote players should not be pushable
    if (!isLocal) {
      body.pushable = false;
      body.immovable = true;
    }
  }

  /** Called by the NetworkManager when a remote player moves. */
  public setTargetPosition(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  /** Called every frame by the OfficeScene update loop. */
  public update(delta: number) {
    void delta;

    // Local player movement is handled directly by Arcade Physics velocity
    if (this.isLocal) return;

    // Remote players smoothly interpolate toward their target position
    const lerpFactor = 0.15;
    this.x = Phaser.Math.Linear(this.x, this.targetX, lerpFactor);
    this.y = Phaser.Math.Linear(this.y, this.targetY, lerpFactor);

    // Depth sort by Y position (higher Y = rendered in front)
    this.setDepth(10 + this.y);
  }

  /** Update the avatar visual when config changes. */
  public updateAvatarConfig(config: AvatarConfig) {
    const next = getPreset(config.presetId);
    if (next.id === this.currentPreset.id) return;

    this.currentPreset = next;
    this.bodyArc.fillColor = next.bodyColor;
    this.bodyArc.setStrokeStyle(2, next.accentColor, 0.8);
    this.tokenText.setText(next.token);
  }

  public destroy(fromScene?: boolean) {
    super.destroy(fromScene);
  }
}
