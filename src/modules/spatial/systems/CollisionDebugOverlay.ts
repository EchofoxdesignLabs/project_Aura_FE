import Phaser from 'phaser';
import { DEPTH, gridToScreen, type IsoLayout } from '../utils/isometric';
import { COLL_EDGE_L, COLL_EDGE_R, COLL_SOLID, type CollisionGrid } from './CollisionGrid';

/**
 * CollisionDebugOverlay — draws solid cells as red blocks at 20 % opacity and walls as red lines.
 * Hidden by default; **F2** toggles it. Call `redraw()` after the grid changes.
 * Adapted from Aura_Assets/integration/phaser/AuraCollision.ts.
 */
export class CollisionDebugOverlay {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly key?: Phaser.Input.Keyboard.Key;
  private readonly scene: Phaser.Scene;
  private readonly grid: CollisionGrid;
  private readonly layout: IsoLayout;

  constructor(scene: Phaser.Scene, grid: CollisionGrid, layout: IsoLayout) {
    this.scene = scene;
    this.grid = grid;
    this.layout = layout;
    this.gfx = scene.add.graphics().setDepth(DEPTH.ZONE_LABEL - 1).setVisible(false);
    this.redraw();

    if (scene.input.keyboard) {
      // No key capture, so F2 still reaches the browser when typing in React inputs.
      this.key = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F2, false);
      this.key.on('down', this.toggle, this);
    }
  }

  redraw(): void {
    const g = this.gfx;
    const p = (gx: number, gy: number) => {
      const s = gridToScreen(gx, gy, this.layout);
      return new Phaser.Math.Vector2(s.sx, s.sy);
    };
    g.clear();
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const flags = this.grid.get(x, y);
        if (!flags) continue;
        if (flags & COLL_SOLID) {
          const cell = [p(x, y), p(x + 1, y), p(x + 1, y + 1), p(x, y + 1)];
          g.fillStyle(0xff0000, 0.2);
          g.fillPoints(cell, true);
          g.lineStyle(1, 0xff0000, 0.7);
          g.strokePoints(cell, true);
        }
        g.lineStyle(3, 0xff0000, 0.7);
        if (flags & COLL_EDGE_L) {
          const a = p(x, y);
          const d = p(x, y + 1);
          g.lineBetween(a.x, a.y, d.x, d.y);
        }
        if (flags & COLL_EDGE_R) {
          const a = p(x, y);
          const b = p(x + 1, y);
          g.lineBetween(a.x, a.y, b.x, b.y);
        }
      }
    }
  }

  toggle(): void {
    this.gfx.setVisible(!this.gfx.visible);
  }

  destroy(): void {
    if (this.key) {
      this.key.off('down', this.toggle, this);
      this.scene.input.keyboard?.removeKey(this.key);
    }
    this.gfx.destroy();
  }
}
