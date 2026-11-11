import Phaser from 'phaser';

/**
 * CameraController — zoom steps and bounds for the office camera (Asset Rulebook R-06 to R-09).
 *
 *   - The camera never rotates. Zoom moves only in set steps: 3×, 2×, 1× (office default) and ½× (R-07),
 *     with the mouse wheel or the + / − keys.
 *   - Positions are rounded to whole pixels so pixel art does not shimmer while walking.
 *   - When the office is smaller than the screen, the bounds are padded so it sits centred.
 *   - Dragging with the middle button (or the left one, when `canDragWithLeft` allows) pans the camera
 *     and stops following the avatar; `resumeFollow` (called when the avatar moves) glides back to it.
 */
export const ZOOM_STEPS = [0.5, 1, 2, 3] as const;
export const DEFAULT_ZOOM = 1;
/** A press that moves less than this (screen px) is a click, not a drag. */
export const DRAG_THRESHOLD = 6;

const FOLLOW_LERP = 0.15;
const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;

interface DragState {
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
  active: boolean;
}

export class CameraController {
  private readonly scene: Phaser.Scene;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly world: { width: number; height: number };
  private zoomIndex: number = ZOOM_STEPS.indexOf(DEFAULT_ZOOM);
  private readonly keys: Phaser.Input.Keyboard.Key[] = [];
  private readonly canDragWithLeft: () => boolean;
  private followTarget: (Phaser.GameObjects.GameObject & { x: number; y: number }) | null = null;
  private following = false;
  private drag: DragState | null = null;
  private readonly preventMiddleClickScroll = (event: MouseEvent) => {
    if (event.button === MIDDLE_BUTTON) event.preventDefault();
  };

  constructor(
    scene: Phaser.Scene,
    worldWidth: number,
    worldHeight: number,
    canDragWithLeft: () => boolean = () => true,
  ) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.world = { width: worldWidth, height: worldHeight };
    this.canDragWithLeft = canDragWithLeft;

    this.camera.setRoundPixels(true);
    this.applyZoom();

    scene.input.on('wheel', this.onWheel, this);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
    // The browser's middle-click autoscroll would fight the pan.
    scene.game.canvas.addEventListener('mousedown', this.preventMiddleClickScroll);
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
    this.followTarget = target;
    this.following = true;
    this.camera.startFollow(target, true, FOLLOW_LERP, FOLLOW_LERP);
  }

  /** After a pan: glide back to the followed target. Cheap to call every frame. */
  resumeFollow(): void {
    if (this.following || !this.followTarget || this.drag?.active) return;
    this.follow(this.followTarget);
  }

  step(direction: 1 | -1): void {
    const next = Phaser.Math.Clamp(this.zoomIndex + direction, 0, ZOOM_STEPS.length - 1);
    if (next === this.zoomIndex) return;
    this.zoomIndex = next;
    this.applyZoom();
  }

  destroy(): void {
    this.scene.input.off('wheel', this.onWheel, this);
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.scene.game.canvas?.removeEventListener('mousedown', this.preventMiddleClickScroll);
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

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const canDrag =
      pointer.button === MIDDLE_BUTTON || (pointer.button === LEFT_BUTTON && this.canDragWithLeft());
    this.drag = canDrag
      ? {
          startX: pointer.x,
          startY: pointer.y,
          scrollX: this.camera.scrollX,
          scrollY: this.camera.scrollY,
          active: false,
        }
      : null;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    if (!drag) return;
    if (!pointer.isDown) {
      this.drag = null;
      return;
    }
    const dx = pointer.x - drag.startX;
    const dy = pointer.y - drag.startY;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.active = true;
      this.camera.stopFollow();
      this.following = false;
    }
    this.camera.setScroll(drag.scrollX - dx / this.zoom, drag.scrollY - dy / this.zoom);
  }

  private onPointerUp(): void {
    this.drag = null;
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
