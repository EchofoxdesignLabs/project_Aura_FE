import Phaser from 'phaser';

/**
 * CameraController — zoom steps and bounds for the office camera (Asset Rulebook R-06 to R-09).
 *
 *   - The camera never rotates. Zoom moves only in set steps: 3×, 2×, 1× (office default) and ½× (R-07),
 *     with the mouse wheel or the + / − keys.
 *   - Positions are rounded to whole pixels so pixel art does not shimmer while walking.
 *   - When the office is smaller than the screen, the bounds are padded so it sits centred.
 */
export const ZOOM_STEPS = [0.5, 1, 2, 3] as const;
export const DEFAULT_ZOOM = 1;

export class CameraController {
  private readonly scene: Phaser.Scene;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly world: { width: number; height: number };
  private zoomIndex: number = ZOOM_STEPS.indexOf(DEFAULT_ZOOM);
  private readonly keys: Phaser.Input.Keyboard.Key[] = [];

  constructor(scene: Phaser.Scene, worldWidth: number, worldHeight: number) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.world = { width: worldWidth, height: worldHeight };

    this.camera.setRoundPixels(true);
    this.applyZoom();

    scene.input.on('wheel', this.onWheel, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.updateBounds, this);

    const keyboard = scene.input.keyboard;
    if (keyboard) {
      // No key capture: these keys must still type into React inputs (chat, forms).
      const zoomIn = [Phaser.Input.Keyboard.KeyCodes.PLUS, Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD];
      const zoomOut = [Phaser.Input.Keyboard.KeyCodes.MINUS, Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT];
      for (const code of zoomIn) this.bindKey(keyboard, code, 1);
      for (const code of zoomOut) this.bindKey(keyboard, code, -1);
    }
  }

  get zoom(): number {
    return ZOOM_STEPS[this.zoomIndex];
  }

  follow(target: Phaser.GameObjects.GameObject & { x: number; y: number }): void {
    this.camera.startFollow(target, true, 0.15, 0.15);
  }

  step(direction: 1 | -1): void {
    const next = Phaser.Math.Clamp(this.zoomIndex + direction, 0, ZOOM_STEPS.length - 1);
    if (next === this.zoomIndex) return;
    this.zoomIndex = next;
    this.applyZoom();
  }

  destroy(): void {
    this.scene.input.off('wheel', this.onWheel, this);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.updateBounds, this);
    for (const key of this.keys) key.removeAllListeners();
  }

  // ─── Internal ───

  private bindKey(keyboard: Phaser.Input.Keyboard.KeyboardPlugin, code: number, direction: 1 | -1): void {
    const key = keyboard.addKey(code, false);
    key.on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
      if (isTypingTarget(event?.target)) return;
      this.step(direction);
    });
    this.keys.push(key);
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (dy === 0) return;
    this.step(dy < 0 ? 1 : -1);
  }

  private applyZoom(): void {
    this.camera.setZoom(this.zoom);
    this.updateBounds();
  }

  /** Bounds at least as large as the view, centred on the world, so a small office sits in the middle. */
  private updateBounds(): void {
    const viewWidth = this.camera.width / this.zoom;
    const viewHeight = this.camera.height / this.zoom;
    const width = Math.max(this.world.width, viewWidth);
    const height = Math.max(this.world.height, viewHeight);
    this.camera.setBounds(
      (this.world.width - width) / 2,
      (this.world.height - height) / 2,
      width,
      height,
    );
  }
}

function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
