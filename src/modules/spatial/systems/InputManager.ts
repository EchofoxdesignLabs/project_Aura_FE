import Phaser from 'phaser';
import { AVATAR_WALK_SPEED } from '../entities/avatar-animations';

/**
 * InputManager — processes WASD / arrow key input.
 *
 * Movement is a **screen-space velocity** (pixels/second). OfficeScene resolves it against the collision grid
 * and converts the result to grid coordinates before emitting `player:move`.
 *
 * Up/down/left/right move straight up/down/left/right on screen. Two keys together move along a tile edge
 * (the 2:1 isometric diagonal, Asset Rulebook R-17) rather than at 45°, so the drawn se/sw/ne/nw views match
 * the path and the avatar walks parallel to desks and walls.
 */
export class InputManager {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private readonly speed = AVATAR_WALK_SPEED;

  constructor(scene: Phaser.Scene) {
    if (!scene.input.keyboard) {
      throw new Error('Keyboard plugin is not enabled in this scene.');
    }

    this.cursors = scene.input.keyboard.createCursorKeys();

    this.wasdKeys = scene.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as unknown as typeof this.wasdKeys;
  }

  /** Velocity for the current frame, in screen px/s. Diagonals follow the 2:1 tile edges at the same speed. */
  public getVelocity(): { vx: number; vy: number } {
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasdKeys.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasdKeys.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasdKeys.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasdKeys.S.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) {
      vy *= 0.5; // 2 px across, 1 px down: along a tile edge
    }

    const length = Math.hypot(vx, vy);
    if (length === 0) return { vx: 0, vy: 0 };

    return {
      vx: (vx / length) * this.speed,
      vy: (vy / length) * this.speed,
    };
  }

  public destroy(): void {
    // Phaser removes keyboard keys when the scene shuts down.
  }
}
