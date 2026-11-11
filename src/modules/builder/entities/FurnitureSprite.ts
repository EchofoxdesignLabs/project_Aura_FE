/**
 * FurnitureSprite — Visual representation of a placed furniture item.
 *
 * A Phaser Container placed on the footprint's top tip (gridToScreen(gridX, gridY)), holding:
 *   1. The item's image: one, or the base layer for seats, from its sprite sheet or a placeholder
 *   2. A selection outline (shown in edit mode on hover/select)
 *
 * A seat's front layer (R-24) lives in its own container just above this one in depth, so a seated avatar
 * can be drawn between the two (SEAT_AVATAR_DEPTH < SEAT_FRONT_DEPTH).
 *
 * FurnitureManager owns depth (sort keys), surface lift and occluder registration; this class only draws.
 */

import Phaser from 'phaser';
import type { FurnitureDefinition, PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint } from '../catalog/furniture-catalog';
import { SEAT_FACING, seatOffset, type FurnitureArt } from '../catalog/furniture-art';
import { createFurnitureImages } from './furniture-visual';
import { furnitureDiamond, gridToScreen, type IsoLayout } from '../../spatial/utils/isometric';

const FADED_ALPHA = 0.4;
/** Depth above the seat's base for a seated avatar, and for the seat's front layer. Below FurnitureManager's tie-break step. */
export const SEAT_AVATAR_DEPTH = 0.0003;
export const SEAT_FRONT_DEPTH = 0.0006;

export interface SeatPose {
  /** Screen position for the avatar's feet. */
  x: number;
  y: number;
  /** Grid position of the seat's cell centre (sent over the network). */
  gx: number;
  gy: number;
  facing: 'se' | 'sw' | 'nw' | 'ne';
  /** Depth that draws the avatar between the seat's base and front. */
  depth: number;
}

export class FurnitureSprite extends Phaser.GameObjects.Container {
  public readonly instanceId: string;
  public readonly catalogId: string;

  private images: Phaser.GameObjects.Image[] = [];
  /** Seats only: holds the front layer, drawn over a seated avatar. */
  private frontLayer: Phaser.GameObjects.Container | null = null;
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
    this.frontLayer?.setAlpha(faded ? FADED_ALPHA : 1);
  }

  /** Sets the depth of the item and of its front layer, if it has one. */
  setDepth(value: number): this {
    super.setDepth(value);
    this.frontLayer?.setDepth(value + SEAT_FRONT_DEPTH);
    return this;
  }

  /** Where and how to sit on this item, or null if it is not a seat. */
  getSeatPose(): SeatPose | null {
    const offset = seatOffset(this.art, this.itemRotation);
    if (!offset) return null;
    const normalized = ((this.itemRotation % 360) + 360) % 360;
    return {
      x: this.x + offset.dx,
      y: this.y + offset.dy,
      gx: this.gridX + 0.5,
      gy: this.gridY + 0.5,
      facing: SEAT_FACING[normalized] ?? 'se',
      depth: this.depth + SEAT_AVATAR_DEPTH,
    };
  }

  /** True if the drawn art covers this world point (bounding boxes, for clicks). */
  containsPoint(worldX: number, worldY: number): boolean {
    return this.images.some((image) => image.getBounds().contains(worldX, worldY));
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

  public destroy(fromScene?: boolean): void {
    this.frontLayer?.destroy(fromScene);
    this.frontLayer = null;
    super.destroy(fromScene);
  }

  private buildImages(): void {
    this.images.forEach((image) => image.destroy());
    this.frontLayer?.destroy();
    this.frontLayer = null;

    const { images, art } = createFurnitureImages(this.scene, this.definition, this.itemRotation);
    this.images = images;
    this.art = art;
    if (images.length > 1) {
      // Seat: base in this container, front layer in its own one above it.
      this.add(images.slice(0, -1));
      this.frontLayer = this.scene.add.container(this.x, this.y, [images[images.length - 1]]);
      this.frontLayer.setDepth(this.depth + SEAT_FRONT_DEPTH).setAlpha(this.alpha);
    } else {
      this.add(images);
    }
    this.bringToTop(this.selectionGraphics);
    this.updateSelectionVisuals();
  }

  private reposition(): void {
    const tip = gridToScreen(this.gridX, this.gridY, this.layout);
    this.setPosition(tip.sx, tip.sy - this.lift);
    this.frontLayer?.setPosition(this.x, this.y);
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
