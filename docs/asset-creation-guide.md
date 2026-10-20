# Asset Creation Guide — Project Aura Runtime Office Builder

This document outlines the workflow and specifications for creating, exporting, and importing custom furniture assets from software like **Aseprite**, **Tiled**, or other design tools into the **Project Aura Isometric Spatial Engine**.

---

## 1. Grid & Isometric Specifications

Project Aura uses a standard **2:1 Isometric Projection** (width-to-height ratio of 2:1).

*   **Logical Tile Resolution**: 1×1 tile is logically represented as $96\text{px} \times 48\text{px}$ in screen coordinates.
*   **Sprite Grid**: All coordinates and positions are calculated using grid tiles (e.g., $gx, gy$).
*   **Bounding Diamonds**: Bounding diamonds are rotated $26.565^\circ$ to form the isometric perspective.

### Footprint & Bounds

Each furniture item has a logical footprint in tiles (e.g., $1\times 1$, $2\times 1$, $2\times 2$, up to $4\times 4$).

*   **$1\times 1$ Item**: Occupies a single $96\times 48$ screen diamond.
*   **$2\times 2$ Item**: Occupies a $192\times 96$ screen diamond.

---

## 2. Aseprite Art Specifications

When drawing isometric furniture sprites in Aseprite:

### Canvas & Angle Guidelines

1.  **Isometric Lines**: Draw diagonal lines with a 2-pixel horizontal steps for every 1-pixel vertical step (`2:1` slope). This ensures pixel-perfect alignment without jagged edges (double pixels).
2.  **Origin/Anchor Point**: The bottom center of the item's baseline footprint diamond should align with the bottom center of the sprite canvas.
3.  **Clearance Zones**: Ensure the sprite fits within the projected diamond footprint of its definition to prevent overlaps.

### Sprite Sheet Export

When exporting animations or static directions from Aseprite:
*   Export as a PNG sheet.
*   Keep background transparent.
*   Prefer a standard naming convention, e.g. `chair_office_south.png` or sheets with frames corresponding to different rotations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$).

---

## 3. Tiled Integration Specification

If you are designing preset maps or templates in Tiled before loading them dynamically at runtime:

1.  **Isometric Map Setup**: Set Map Orientation to `Isometric` (not Staggered).
2.  **Tile Dimensions**: Set Tile Width to `96` and Tile Height to `48`.
3.  **Tile Properties**: Add custom properties to furniture tiles:
    *   `blocksMovement` (boolean)
    *   `catalogId` (string)
    *   `allowedRotations` (string e.g. `0,90,180,270`)

---

## 4. Registering Custom Assets in the Codebase

Once you have your sprite sheet/image:

### Step 1: Add Sprite to Assets Directory
Place your asset in `public/assets/furniture/`:
*   `public/assets/furniture/chair_office.png`

### Step 2: Define the Item in `furniture-catalog.ts`
Open [furniture-catalog.ts](file:///d:/Echofox/project_Aura_FE/src/modules/builder/catalog/furniture-catalog.ts) and ensure your new item's footprint, rotations, and movement traits are registered.

### Step 3: Register in the Default Catalog
Open [default-catalog.ts](file:///d:/Echofox/project_Aura_FE/src/modules/builder/catalog/default-catalog.ts) and add the item registration:
```typescript
{
  id: 'chair_premium',
  name: 'Premium Ergonomic Chair',
  category: FurnitureCategory.SEATING,
  footprint: [1, 1],
  blocksMovement: true,
  allowedRotations: [0, 90, 180, 270],
}
```

### Step 4: Asset Preloader registration
Register the asset key inside `ensureFurnitureTextures` in [asset-loader.ts](file:///d:/Echofox/project_Aura_FE/src/modules/builder/catalog/asset-loader.ts) to map the `id` to the actual sprite sheet image path. The preloader will automatically load the sprite instead of generating a canvas placeholder.
