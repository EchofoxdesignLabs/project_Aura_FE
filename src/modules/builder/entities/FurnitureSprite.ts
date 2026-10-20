/**
 * FurnitureSprite — Visual representation of a placed furniture item.
 *
 * A Phaser Container that renders:
 *   1. The furniture sprite (from texture atlas or placeholder)
 *   2. A selection outline (shown in edit mode on hover/select)
 *   3. A collision body (for items with blocksMovement: true)
 *
 * Depth-sorted using the isometric formula based on the item's
 * bottom-most grid cell. Players walk in front of and behind
 * furniture correctly.
 */

import Phaser from 'phaser';
import type { FurnitureDefinition, PlacedFurnitureItem } from '../catalog/furniture-catalog';
import { getRotatedFootprint } from '../catalog/furniture-catalog';
import {
  gridToScreen,
  furnitureDiamond,
  furnitureDepth,
  furnitureCenter,
  type IsoLayout,
} from '../../spatial/utils/isometric';

export class FurnitureSprite extends Phaser.GameObjects.Container {
  public readonly instanceId: string;
  public readonly catalogId: string;

  private sprite: Phaser.GameObjects.Sprite;
  private selectionGraphics: Phaser.GameObjects.Graphics;
  private definition: FurnitureDefinition;
  private currentGridX: number;
  private currentGridY: number;
  private currentRotation: number;
  private layout: IsoLayout;
  private isHighlighted = false;
  private isSelected = false;

  constructor(
    scene: Phaser.Scene,
    item: PlacedFurnitureItem,
    definition: FurnitureDefinition,
    layout: IsoLayout,
  ) {
    // Calculate screen position from grid position
    const footprint = getRotatedFootprint(definition.footprint, item.rotation);
    const center = furnitureCenter(item.gridX, item.gridY, footprint, layout);

    super(scene, center.sx, center.sy);

    this.instanceId = item.instanceId;
    this.catalogId = item.catalogId;
    this.definition = definition;
    this.currentGridX = item.gridX;
    this.currentGridY = item.gridY;
    this.currentRotation = item.rotation;
    this.layout = layout;

    // 1. Create the furniture sprite
    this.sprite = scene.add.sprite(0, 0, definition.textureKey);

    // Apply rotation via angle
    if (item.rotation !== 0) {
      this.sprite.setAngle(item.rotation);
    }

    // Scale sprite to roughly match the footprint on the isometric grid
    const targetW = (footprint[0] + footprint[1]) * (layout.tileWidth / 2);
    const targetH = (footprint[0] + footprint[1]) * (layout.tileHeight / 2);
    if (this.sprite.width > 0 && this.sprite.height > 0) {
      this.sprite.setDisplaySize(targetW * 0.85, targetH * 0.85);
    }

    // Apply anchor offset
    this.sprite.setPosition(
      definition.anchorOffset.x,
      definition.anchorOffset.y,
    );

    // 2. Create selection outline graphics (hidden by default)
    this.selectionGraphics = scene.add.graphics();
    this.selectionGraphics.setVisible(false);
    this.drawSelectionOutline();

    // 3. Add to container
    this.add([this.selectionGraphics, this.sprite]);

    // 4. Set depth (iso-sort)
    const depth = furnitureDepth(item.gridX, item.gridY, footprint, definition.depthOffset);
    this.setDepth(depth);

    // 5. Add to scene
    scene.add.existing(this);

    // 6. Create collision body if needed
    if (definition.blocksMovement) {
      this.createCollisionBody(scene, item.gridX, item.gridY, footprint, layout);
    }
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

  /** Update position after a move operation. */
  updateGridPosition(newGx: number, newGy: number, layout: IsoLayout): void {
    this.currentGridX = newGx;
    this.currentGridY = newGy;
    this.layout = layout;

    const footprint = getRotatedFootprint(this.definition.footprint, this.currentRotation);
    const center = furnitureCenter(newGx, newGy, footprint, layout);

    this.setPosition(center.sx, center.sy);

    const depth = furnitureDepth(newGx, newGy, footprint, this.definition.depthOffset);
    this.setDepth(depth);

    this.drawSelectionOutline();
  }

  /** Get the current grid position. */
  getGridPosition(): { gx: number; gy: number } {
    return { gx: this.currentGridX, gy: this.currentGridY };
  }

  /** Get the current rotation. */
  getRotation(): number {
    return this.currentRotation;
  }

  // ─── Internal ───

  private updateSelectionVisuals(): void {
    this.selectionGraphics.setVisible(this.isHighlighted || this.isSelected);

    if (this.isSelected) {
      this.sprite.setAlpha(0.9);
      this.sprite.setTint(0x60a5fa); // Blue tint for selected
    } else if (this.isHighlighted) {
      this.sprite.setAlpha(0.95);
      this.sprite.clearTint();
    } else {
      this.sprite.setAlpha(1);
      this.sprite.clearTint();
    }
  }

  private drawSelectionOutline(): void {
    this.selectionGraphics.clear();

    const footprint = getRotatedFootprint(this.definition.footprint, this.currentRotation);
    const diamond = furnitureDiamond(
      this.currentGridX,
      this.currentGridY,
      footprint,
      this.layout,
    );

    // Convert diamond points to local coordinates (relative to this container)
    const centerScreen = furnitureCenter(
      this.currentGridX,
      this.currentGridY,
      footprint,
      this.layout,
    );

    // Selection outline — dashed blue border
    this.selectionGraphics.lineStyle(2, 0x60a5fa, 0.8);
    this.selectionGraphics.beginPath();
    const localPoints = diamond.map((p) => ({
      x: p.sx - centerScreen.sx,
      y: p.sy - centerScreen.sy,
    }));
    this.selectionGraphics.moveTo(localPoints[0].x, localPoints[0].y);
    for (let i = 1; i < localPoints.length; i++) {
      this.selectionGraphics.lineTo(localPoints[i].x, localPoints[i].y);
    }
    this.selectionGraphics.closePath();
    this.selectionGraphics.strokePath();
  }

  private createCollisionBody(
    scene: Phaser.Scene,
    gx: number,
    gy: number,
    footprint: [number, number],
    layout: IsoLayout,
  ): void {
    // Create an invisible rectangle at the screen position with a static body
    const topLeft = gridToScreen(gx, gy, layout);
    const bottomRight = gridToScreen(gx + footprint[0], gy + footprint[1], layout);
    const width = Math.abs(bottomRight.sx - topLeft.sx);
    const height = Math.abs(bottomRight.sy - topLeft.sy);

    // Use a zone for collision detection (simpler than a full sprite)
    const center = furnitureCenter(gx, gy, footprint, layout);
    const collisionZone = scene.add.zone(center.sx, center.sy, width, height);
    scene.physics.add.existing(collisionZone, true); // static body

    // Store reference for cleanup
    (this as unknown as Record<string, unknown>)._collisionZone = collisionZone;
  }

  destroy(fromScene?: boolean): void {
    // Clean up collision zone if it exists
    const collisionZone = (this as unknown as Record<string, unknown>)._collisionZone as
      | Phaser.GameObjects.Zone
      | undefined;
    if (collisionZone) {
      collisionZone.destroy();
    }
    super.destroy(fromScene);
  }
}
