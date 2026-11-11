import Phaser from 'phaser';

/**
 * InputManager — processes WASD / arrow key input.
 *
 * Movement is emitted as **screen-space velocity** (pixels/second).
 * The OfficeScene converts the resulting screen position back to
 * grid coordinates before emitting `player:move` to the server.
 *
 * In isometric view, pressing "up" moves the player visually upward
 * on screen, which corresponds to moving diagonally on the grid.
 * This feels natural and matches SoWork-style controls.
 */
export class InputManager {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // Fixed movement speed in pixels per second
  private readonly speed = 200;

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

  /**
   * Calculates and returns the normalized velocity vector for the current frame.
   * Normalization ensures that diagonal movement is not faster than cardinal movement.
   */
  public getVelocity(): { vx: number; vy: number } {
    let vx = 0;
    let vy = 0;

    const isLeft = this.cursors.left.isDown || this.wasdKeys.A.isDown;
    const isRight = this.cursors.right.isDown || this.wasdKeys.D.isDown;
    const isUp = this.cursors.up.isDown || this.wasdKeys.W.isDown;
    const isDown = this.cursors.down.isDown || this.wasdKeys.S.isDown;

    if (isLeft) vx -= 1;
    if (isRight) vx += 1;
    if (isUp) vy -= 1;
    if (isDown) vy += 1;

    // Normalize the vector if moving diagonally
    if (vx !== 0 && vy !== 0) {
      const length = Math.sqrt(vx * vx + vy * vy);
      vx /= length;
      vy /= length;
    }

    return {
      vx: vx * this.speed,
      vy: vy * this.speed,
    };
  }

  public destroy(): void {
    // Phaser handles basic input cleanup when the scene is destroyed,
    // but this method is exposed for any future explicit teardown needs.
  }
}
