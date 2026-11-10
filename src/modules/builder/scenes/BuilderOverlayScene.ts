/**
 * BuilderOverlayScene — Parallel Phaser scene for builder-mode visuals.
 *
 * Runs on top of OfficeScene (launched via `this.scene.launch('BuilderOverlay')`).
 * Handles:
 *   1. Ghost sprite — semi-transparent preview following the cursor
 *   2. Cell highlights — shows which cells would be occupied (green/red)
 *   3. Grid overlay — subtle grid lines for alignment (hidden in play mode)
 *
 * This scene is slept/woken based on the edit mode toggle.
 * It reads mouse coordinates from the main camera of OfficeScene.
 */

import Phaser from 'phaser';
import { useBuilderStore } from '../state/builder.store';
import type { FurnitureDefinition } from '../catalog/furniture-catalog';
import { getRotatedFootprint, getCellsOccupied } from '../catalog/furniture-catalog';
import {
  snapToGrid,
  tileDiamond,
  furnitureDiamond,
  furnitureCenter,
  type IsoLayout,
  type ScreenPoint,
} from '../../spatial/utils/isometric';

export class BuilderOverlayScene extends Phaser.Scene {
  private ghostSprite: Phaser.GameObjects.Sprite | null = null;
  private cellHighlights!: Phaser.GameObjects.Graphics;
  private gridOverlay!: Phaser.GameObjects.Graphics;
  private isoLayout!: IsoLayout;
  private gridCols = 24;
  private gridRows = 18;

  // Track the last ghost position to avoid unnecessary redraws
  private lastGhostGx = -1;
  private lastGhostGy = -1;
  private lastGhostValid = false;

  constructor() {
    super({ key: 'BuilderOverlay' });
  }

  init(data: { isoLayout: IsoLayout; gridCols: number; gridRows: number }): void {
    this.isoLayout = data.isoLayout;
    this.gridCols = data.gridCols;
    this.gridRows = data.gridRows;
  }

  create(): void {
    // Match the camera bounds to the OfficeScene
    const officeScene = this.scene.get('OfficeScene');
    if (officeScene) {
      const cam = officeScene.cameras.main;
      this.cameras.main.setBounds(
        cam.getBounds().x,
        cam.getBounds().y,
        cam.getBounds().width,
        cam.getBounds().height,
      );
    }

    // Create graphics layers
    this.gridOverlay = this.add.graphics();
    this.gridOverlay.setDepth(2);
    this.gridOverlay.setVisible(false);

    this.cellHighlights = this.add.graphics();
    this.cellHighlights.setDepth(500);

    // Start hidden — activated when edit mode is entered
    this.scene.sleep();
  }

  update(): void {
    const state = useBuilderStore.getState();
    if (!state.isEditMode) return;

    // Sync camera with OfficeScene
    this.syncCamera();

    // Update ghost cursor position
    const pointer = this.input.activePointer;
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    const gridPos = snapToGrid(worldX, worldY, this.isoLayout);

    // Update store with current ghost position
    if (state.selectedCatalogItem) {
      state.updateGhostPosition(gridPos.gx, gridPos.gy);
      this.updateGhostVisuals(gridPos.gx, gridPos.gy, state.selectedCatalogItem, state.currentRotation);
    } else {
      this.clearGhost();
    }
  }

  // ─── Public API ───

  /** Show/hide the entire builder overlay. */
  public setEditMode(active: boolean): void {
    if (active) {
      this.scene.wake();
      this.drawGridOverlay();
      this.gridOverlay.setVisible(true);
    } else {
      this.clearGhost();
      this.cellHighlights.clear();
      this.gridOverlay.setVisible(false);
      this.scene.sleep();
    }
  }

  /** Update the ghost sprite when the selected catalog item changes. */
  public updateGhostItem(definition: FurnitureDefinition | null, rotation: number): void {
    if (!definition) {
      this.clearGhost();
      return;
    }

    // Destroy old ghost and create new one
    if (this.ghostSprite) {
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }

    this.ghostSprite = this.add.sprite(0, 0, definition.textureKey);
    this.ghostSprite.setAlpha(0.6);
    this.ghostSprite.setDepth(600);

    // Scale to match footprint
    const footprint = getRotatedFootprint(definition.footprint, rotation);
    const targetW = (footprint[0] + footprint[1]) * (this.isoLayout.tileWidth / 2);
    const targetH = (footprint[0] + footprint[1]) * (this.isoLayout.tileHeight / 2);
    if (this.ghostSprite.width > 0 && this.ghostSprite.height > 0) {
      this.ghostSprite.setDisplaySize(targetW * 0.85, targetH * 0.85);
    }

    if (rotation !== 0) {
      this.ghostSprite.setAngle(rotation);
    }

    // Force position update on next frame
    this.lastGhostGx = -1;
    this.lastGhostGy = -1;
  }

  // ─── Internal ───

  private syncCamera(): void {
    const officeScene = this.scene.get('OfficeScene');
    if (!officeScene) return;

    const offCam = officeScene.cameras.main;
    const myCam = this.cameras.main;

    myCam.setScroll(offCam.scrollX, offCam.scrollY);
    myCam.setZoom(offCam.zoom);
  }

  private updateGhostVisuals(
    gx: number,
    gy: number,
    definition: FurnitureDefinition,
    rotation: number,
  ): void {
    const state = useBuilderStore.getState();
    const isValid = state.ghostValid;

    // Skip if nothing changed
    if (
      gx === this.lastGhostGx &&
      gy === this.lastGhostGy &&
      isValid === this.lastGhostValid
    ) {
      return;
    }

    this.lastGhostGx = gx;
    this.lastGhostGy = gy;
    this.lastGhostValid = isValid;

    const footprint = getRotatedFootprint(definition.footprint, rotation);

    // 1. Position the ghost sprite
    if (this.ghostSprite) {
      const center = furnitureCenter(gx, gy, footprint, this.isoLayout);
      this.ghostSprite.setPosition(center.sx, center.sy);
      this.ghostSprite.setTint(isValid ? 0x22c55e : 0xef4444);
    }

    // 2. Draw cell highlights
    this.cellHighlights.clear();
    const cells = getCellsOccupied(gx, gy, footprint);
    const fillColor = isValid ? 0x22c55e : 0xef4444;
    const fillAlpha = isValid ? 0.2 : 0.3;
    const strokeColor = isValid ? 0x22c55e : 0xef4444;

    for (const cell of cells) {
      if (cell.gx < 0 || cell.gx >= this.gridCols || cell.gy < 0 || cell.gy >= this.gridRows) {
        continue;
      }

      const diamond = tileDiamond(cell.gx, cell.gy, this.isoLayout);
      this.drawDiamond(this.cellHighlights, diamond, fillColor, fillAlpha, strokeColor, 0.6, 1.5);
    }

    // 3. Draw the footprint outline
    const footprintDiamond = furnitureDiamond(gx, gy, footprint, this.isoLayout);
    this.cellHighlights.lineStyle(2, strokeColor, 0.8);
    this.cellHighlights.beginPath();
    this.cellHighlights.moveTo(footprintDiamond[0].sx, footprintDiamond[0].sy);
    for (let i = 1; i < footprintDiamond.length; i++) {
      this.cellHighlights.lineTo(footprintDiamond[i].sx, footprintDiamond[i].sy);
    }
    this.cellHighlights.closePath();
    this.cellHighlights.strokePath();
  }

  private clearGhost(): void {
    if (this.ghostSprite) {
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }
    this.cellHighlights.clear();
    this.lastGhostGx = -1;
    this.lastGhostGy = -1;
  }

  private drawGridOverlay(): void {
    this.gridOverlay.clear();
    this.gridOverlay.lineStyle(1, 0x334155, 0.15);

    for (let gx = 0; gx < this.gridCols; gx++) {
      for (let gy = 0; gy < this.gridRows; gy++) {
        const diamond = tileDiamond(gx, gy, this.isoLayout);
        this.gridOverlay.beginPath();
        this.gridOverlay.moveTo(diamond[0].sx, diamond[0].sy);
        for (let i = 1; i < diamond.length; i++) {
          this.gridOverlay.lineTo(diamond[i].sx, diamond[i].sy);
        }
        this.gridOverlay.closePath();
        this.gridOverlay.strokePath();
      }
    }
  }

  private drawDiamond(
    graphics: Phaser.GameObjects.Graphics,
    points: ScreenPoint[],
    fillColor: number,
    fillAlpha: number,
    strokeColor: number,
    strokeAlpha: number,
    strokeWidth: number,
  ): void {
    graphics.fillStyle(fillColor, fillAlpha);
    graphics.lineStyle(strokeWidth, strokeColor, strokeAlpha);
    graphics.beginPath();
    graphics.moveTo(points[0].sx, points[0].sy);
    for (let i = 1; i < points.length; i++) {
      graphics.lineTo(points[i].sx, points[i].sy);
    }
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }
}
