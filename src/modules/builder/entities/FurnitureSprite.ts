/**
 * FurnitureSprite — Visual representation of a placed furniture item.
 *
 * A Phaser Container placed on the footprint's top tip (gridToScreen(gridX, gridY)), holding:
 *   1. The item's image(s): one, or base + front for seats (R-24), from its sprite sheet or a placeholder
 *   2. A selection outline (shown in edit mode on hover/select)
 *
 * FurnitureManager owns depth (sort keys), surface lift and occluder registration; this class only draws.
 */

import Phaser from 'phaser';
import type { FurnitureDefinition, PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint } from '../catalog/furniture-catalog';
import type { FurnitureArt } from '../catalog/furniture-art';
import { createFurnitureImages } from './furniture-visual';
import { furnitureDiamond, gridToScreen, type IsoLayout } from '../../spatial/utils/isometric';

const FADED_ALPHA = 0.4;

export class FurnitureSprite extends Phaser.GameObjects.Container {
  public readonly instanceId: string;
  public readonly catalogId: string;

  private images: Phaser.GameObjects.Image[] = [];
  private art!: FurnitureArt;
  private readonly selectionGraphics: Phaser.GameObjects.Graphics;
  private readonly definition: FurnitureDefinition;
  private readonly layout: IsoLayout;
  private gridX: number;
  private gridY: number;
  private itemRotation: number;
  private lift = 0;
  private isHighlighted = false;
  private isSelected = false;

  constructor(
    scene: Phaser.Scene,
    item: PlacedFurnitureItem,
    definition: FurnitureDefinition,
    layout: IsoLayout,
  ) {
    super(scene, 0, 0);

    this.instanceId = item.instanceId;
    this.catalogId = item.catalogId;
    this.definition = definition;
    this.layout = layout;
    this.gridX = item.gridX;
    this.gridY = item.gridY;
    this.itemRotation = item.rotation;

    this.selectionGraphics = scene.add.graphics().setVisible(false);
    this.add(this.selectionGraphics);
    this.buildImages();
    this.reposition();

    scene.add.existing(this);
  }

  /** Moves/rotates the item. `lift` raises surface items onto their host (art px). */
  setPlacement(gridX: number, gridY: number, rotation: number, lift: number): void {
    const rotated = rotation !== this.itemRotation;
    this.gridX = gridX;
    this.gridY = gridY;
    this.itemRotation = rotation;
    this.lift = lift;
    if (rotated) this.buildImages();
    this.reposition();
  }

  /** Highlight this item when hovered in edit mode. */
  setHighlighted(highlighted: boolean): void {
    if (this.isHighlighted === highlighted) return;
    this.isHighlighted = highlighted;
    this.updateSelectionVisuals();
  }

  /** Mark this item as selected (for move/delete). */
  setSelected(selected: boolean): void {
    if (this.isSelected === selected) return;
    this.isSelected = selected;
    this.updateSelectionVisuals();
  }

  /** R-35: fade while it hides the local avatar. */
  setFaded(faded: boolean): void {
    this.setAlpha(faded ? FADED_ALPHA : 1);
  }

  getGridPosition(): { gx: number; gy: number } {
    return { gx: this.gridX, gy: this.gridY };
  }

  getRotation(): number {
    return this.itemRotation;
  }

  getFootprint(): [number, number] {
    return getRotatedFootprint(this.definition.footprint, this.itemRotation);
  }

  /** Art height in pixels (floor to top), from the manifest. */
  getArtHeight(): number {
    return this.art.height;
  }

  isDecal(): boolean {
    return this.art.decal;
  }

  // ─── Internal ───

  private buildImages(): void {
    this.images.forEach((image) => image.destroy());
    const { images, art } = createFurnitureImages(this.scene, this.definition, this.itemRotation);
    this.images = images;
    this.art = art;
    this.add(images);
    this.bringToTop(this.selectionGraphics);
    this.updateSelectionVisuals();
  }

  private reposition(): void {
    const tip = gridToScreen(this.gridX, this.gridY, this.layout);
    this.setPosition(tip.sx, tip.sy - this.lift);
    this.drawSelectionOutline();
  }

  private updateSelectionVisuals(): void {
    this.selectionGraphics.setVisible(this.isHighlighted || this.isSelected);
    for (const image of this.images) {
      if (this.isSelected) {
        image.setTint(0x60a5fa);
      } else {
        image.clearTint();
      }
    }
  }

  private drawSelectionOutline(): void {
    const diamond = furnitureDiamond(this.gridX, this.gridY, this.getFootprint(), this.layout);
    const points = diamond.map((p) => new Phaser.Math.Vector2(p.sx - this.x, p.sy - this.y - this.lift));

    this.selectionGraphics.clear();
    this.selectionGraphics.fillStyle(0x60a5fa, 0.15);
    this.selectionGraphics.fillPoints(points, true);
    this.selectionGraphics.lineStyle(2, 0x60a5fa, 0.9);
    this.selectionGraphics.strokePoints(points, true);
  }
}
