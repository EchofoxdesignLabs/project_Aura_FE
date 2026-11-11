import Phaser from 'phaser';
import { resolveFurnitureTexture } from '../catalog/asset-loader';
import { resolveFurnitureView, type FurnitureArt } from '../catalog/furniture-art';
import type { FurnitureDefinition } from '../catalog/furniture-catalog';

/**
 * Creates the images for one furniture item at a rotation, positioned so (0, 0) is the footprint's top tip
 * at floor level. Seats get a base and a front image (R-24); everything else one image.
 * The caller adds them to a container placed at gridToScreen(gridX, gridY).
 */
export function createFurnitureImages(
  scene: Phaser.Scene,
  definition: FurnitureDefinition,
  rotation: number,
): { images: Phaser.GameObjects.Image[]; art: FurnitureArt } {
  const { textureKey, art } = resolveFurnitureTexture(scene, definition);
  const view = resolveFurnitureView(art, rotation);

  const images = view.frames.map((frame) =>
    scene.add
      .image(0, 0, textureKey, scene.textures.get(textureKey).has(String(frame)) ? frame : undefined)
      .setOrigin(view.originX, view.originY)
      .setFlipX(view.flipX),
  );
  return { images, art };
}
