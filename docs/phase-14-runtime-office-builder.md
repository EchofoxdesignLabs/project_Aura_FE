# Phase 14: Runtime Office Builder — Dynamic Grid Placement System

## Goal

Replace the current static, hardcoded office layout (drawn via Phaser Graphics primitives and seeded from `DEFAULT_OFFICE_CONFIG` in the backend) with a **dynamic, in-game runtime office builder** that allows ORG_ADMINs to drag, drop, rotate, and arrange furniture using actual sprite and texture assets authored in Aseprite, Tiled, and similar tools. The system is built around three parallel architectural layers: a **Logical Data Layer** (state), a **Coordinate Projection Layer** (math), and a **Visual Feedback Layer** (Phaser scenes).

## Current State

| Component | Status | Detail |
|---|---|---|
| `OfficeScene.ts` | ✅ Working | Draws isometric floor with `Phaser.Graphics` fill/stroke diamonds. Zones rendered as colored polygons with text labels. No sprite/texture assets. |
| `isometric.ts` utilities | ✅ Working | `gridToScreen`, `screenToGrid`, `tileDiamond`, `zoneDiamond`, `isPointInPolygon` — pure math functions. 2:1 standard isometric transform. |
| `PlayerSprite.ts` | ✅ Working | Renders players as `Phaser.GameObjects.Arc` (circles) inside Containers. No spritesheet-based avatars. |
| Backend `Zone` entity | ✅ Working | Stores `x, y, width, height, anchorX, anchorY, type, assignedUserId` — no rotation, no furniture item references. |
| Backend `Office` entity | ✅ Working | Stores `gridWidth, gridHeight, tileWidth, tileHeight, layoutMode`. Static seed layout only. |
| Backend `office.service.ts` | ✅ Working | `DEFAULT_OFFICE_CONFIG` hardcodes 10 zones. `seedDefaultOffice()` / `reseedDefaultOffice()` recreate this static layout. |
| Asset pipeline | ⬜ Not started | No Aseprite exports, no Tiled tilemaps, no spritesheet loading, no texture atlases. |
| Builder UI | ⬜ Not started | No drag-and-drop, no furniture catalog, no placement preview, no edit mode toggle. |

> [!IMPORTANT]
> **This is a major architectural evolution.** The current system draws everything with `graphics.fillStyle()` / `graphics.beginPath()` — there are zero image assets. Phase 14 introduces a complete asset pipeline, a furniture catalog data model, a multi-layer Phaser scene graph, and backend persistence for user-placed furniture — while preserving all existing multiplayer, presence, meeting, and desk assignment functionality.

---

## Architecture Overview — The Three Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                      VISUAL FEEDBACK LAYER                        │
│                     (Phaser Scene Graph)                           │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Floor Layer  │  │ Furniture    │  │ Ghost Cursor / Placement  │ │
│  │ (Tiled TMX  │  │ Layer        │  │ Preview Layer             │ │
│  │  tilemap)   │  │ (iso-sorted  │  │ (tinted green/red sprite  │ │
│  │             │  │  sprites)    │  │  snapping to grid)        │ │
│  └─────────────┘  └──────────────┘  └───────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ reads placement coords from
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   COORDINATE PROJECTION LAYER                     │
│                        (Pure Math)                                │
│                                                                   │
│  ┌───────────────────────┐  ┌─────────────────────────────┐       │
│  │ IsometricProjection   │  │ GridSnapper                 │       │
│  │ .screenToGrid()       │  │ .snapToNearestTile()        │       │
│  │ .gridToScreen()       │  │ .getOccupiedCells(item,rot) │       │
│  │ .tileDiamond()        │  │ .isPlacementValid()         │       │
│  └───────────────────────┘  └─────────────────────────────┘       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ reads/writes
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LOGICAL DATA LAYER                            │
│                     (State / Zustand)                              │
│                                                                   │
│  ┌──────────────────────┐  ┌──────────────────────────────┐       │
│  │ OccupancyGrid        │  │ BuilderStore (Zustand)       │       │
│  │ 2D array [row][col]  │  │ .placedItems[]               │       │
│  │ null = free           │  │ .selectedCatalogItem         │       │
│  │ string = item ID     │  │ .ghostPosition               │       │
│  │                      │  │ .isEditMode                   │       │
│  └──────────────────────┘  │ .undoStack / redoStack       │       │
│                            └──────────────────────────────┘       │
│                                    │ serialize/deserialize         │
│                                    ▼                              │
│                         ┌────────────────────┐                    │
│                         │ Backend REST/WS    │                    │
│                         │ office:layout:save │                    │
│                         │ office:layout:load │                    │
│                         └────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## User Review Required

> [!IMPORTANT]
> **Edit Mode vs. Play Mode**: The builder is only accessible to `ORG_ADMIN` users. A toggle button switches between **Play Mode** (normal office experience — walk around, meetings, presence) and **Edit Mode** (furniture placement — WASD movement disabled, click-to-place enabled). Other users in the office see furniture changes in real-time but cannot enter Edit Mode.

> [!WARNING]
> **Breaking Asset Requirement**: This phase requires actual sprite/texture assets. The implementation plan includes a placeholder asset pipeline using programmatically generated sprites during development, with a clear interface for swapping in professional Aseprite/Tiled exports later. **No Aseprite or Tiled licenses are required for initial development.**

> [!IMPORTANT]
> **Backend Schema Changes**: A new `FurnitureItem` database entity and a `furniture_placements` table will be added. The existing `Zone` entity is preserved — furniture items are a separate concept from zones. Zones define spatial behavior (meeting, desk, lobby); furniture items define visual decoration and physical collision bounds.

---

## Design Decisions (Resolved)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Grid Resolution**: Use the existing **24×18 grid** (96×48 tiles). No sub-grid for MVP. | Immediate compatibility with existing Zone logic. A 2× sub-grid (48×36) can be added later if placement feels too coarse — but deferred to avoid matrix complexity and asset pipeline churn. |
| 2 | **Max Furniture Footprint**: Capped at **4×4 tiles**. Larger structures are built modularly (e.g., two 2×2 tables side-by-side). | Keeps `getCellsOccupied()` math lightweight and prevents pathfinding anomalies. |
| 3 | **Collision Model**: No auto-generated clearance zones. Collision is driven **strictly by `blocksMovement: true`** in `FurnitureDefinition`. `FurnitureManager` spawns an invisible, static Arcade Physics body matching the resolved footprint when this flag is set. | Simpler model, avoids a second zone system. Collision is a property of the item, not the grid. |
| 4 | **Real-time Sync**: **Optimistic UI + immediate WebSocket broadcast** (`furniture:placed`, `furniture:removed`, `furniture:moved`). No "Publish" step. | Seamless collaborative feel. Avoids state-locking complexity and friction for admins. |

---

## Proposed Changes

---

### Phase 14A: Asset Pipeline & Furniture Catalog Data Model

Establishes the foundation for loading, categorizing, and referencing sprite-based furniture assets.

---

#### [NEW] `src/modules/builder/catalog/furniture-catalog.ts`

The furniture catalog — a typed registry of all available furniture items with their sprite references, grid footprints, categories, and placement rules.

```typescript
export enum FurnitureCategory {
  DESK = 'DESK',
  CHAIR = 'CHAIR',
  TABLE = 'TABLE',
  DECORATION = 'DECORATION',
  WALL = 'WALL',
  PLANT = 'PLANT',
  ELECTRONICS = 'ELECTRONICS',
  STORAGE = 'STORAGE',
}

export interface FurnitureDefinition {
  /** Unique catalog ID (e.g., 'desk-standard-01') */
  id: string;
  /** Display name in the builder UI */
  name: string;
  /** Category for catalog filtering */
  category: FurnitureCategory;
  /** Grid footprint in tiles [columns, rows] at rotation 0 */
  footprint: [number, number];
  /** Texture atlas key loaded into Phaser */
  atlasKey: string;
  /** Frame name within the atlas (or null for single-image textures) */
  frameName: string | null;
  /** Pixel anchor offset from the top-left of the sprite to the grid origin */
  anchorOffset: { x: number; y: number };
  /** Whether this item blocks player movement */
  blocksMovement: boolean;
  /** Allowed rotations in degrees (typically [0, 90, 180, 270]) */
  allowedRotations: number[];
  /** Depth offset added to the iso-sort depth for layering */
  depthOffset: number;
  /** Thumbnail path for the builder catalog UI (React side) */
  thumbnailUrl: string;
  /** Zone type association — if placing this auto-creates a zone */
  associatedZoneType: string | null;
}
```

#### [NEW] `src/modules/builder/catalog/default-catalog.ts`

Ships with a starter set of furniture definitions. Initially uses programmatic placeholder sprites, later swapped for Aseprite exports.

#### [NEW] `public/assets/furniture/` directory

Directory structure for all furniture sprite assets:
```
public/assets/furniture/
├── atlases/                  # Texture atlas JSON + PNG (packed via TexturePacker or free alternatives)
│   ├── office-furniture.json
│   └── office-furniture.png
├── individual/               # Single-item PNGs (for items not yet atlas-packed)
│   ├── desk-standard-01.png
│   ├── chair-office-01.png
│   └── ...
├── tilesets/                 # Tiled-compatible tilesets for floor/wall textures
│   ├── floor-tiles.tsx
│   └── floor-tiles.png
└── thumbnails/               # 64×64 thumbnails for the React catalog UI
    ├── desk-standard-01.png
    └── ...
```

#### [NEW] `src/modules/builder/catalog/asset-loader.ts`

Phaser preload helper that loads all furniture atlases and individual textures. Called from a new `PreloadScene` or from `OfficeScene.preload()`.

```typescript
export function preloadFurnitureAssets(scene: Phaser.Scene): void {
  // Load texture atlases
  scene.load.atlas('office-furniture', 
    '/assets/furniture/atlases/office-furniture.png',
    '/assets/furniture/atlases/office-furniture.json'
  );
  // Load individual fallback textures
  // ...
}
```

---

### Phase 14B: Logical Data Layer — Occupancy Grid & Builder State

The "brain" of the builder. A 2D occupancy grid tracks what's placed where, and a Zustand store manages all builder UI state.

---

#### [NEW] `src/modules/builder/state/occupancy-grid.ts`

A pure-logic 2D grid that tracks cell occupancy. No Phaser dependency — can be serialized to JSON.

```typescript
export interface PlacedFurnitureItem {
  /** Unique instance ID (UUID) */
  instanceId: string;
  /** Catalog definition ID */
  catalogId: string;
  /** Grid position (top-left cell of the footprint) */
  gridX: number;
  gridY: number;
  /** Current rotation in degrees */
  rotation: number;
  /** Resolved footprint after rotation [cols, rows] */
  resolvedFootprint: [number, number];
}

export class OccupancyGrid {
  private grid: (string | null)[][];  // instanceId or null
  
  constructor(public readonly cols: number, public readonly rows: number) { ... }
  
  /** Check if a furniture item can be placed at (gx, gy) with given footprint */
  canPlace(gx: number, gy: number, footprint: [number, number]): boolean { ... }
  
  /** Place an item — marks all occupied cells with the instanceId */
  place(item: PlacedFurnitureItem): void { ... }
  
  /** Remove an item — clears all cells occupied by this instanceId */
  remove(instanceId: string): void { ... }
  
  /** Get the item ID at a specific cell */
  getAt(gx: number, gy: number): string | null { ... }
  
  /** Serialize to a compact JSON representation for backend persistence */
  serialize(): string { ... }
  
  /** Restore from serialized JSON */
  static deserialize(json: string, cols: number, rows: number): OccupancyGrid { ... }
}
```

#### [NEW] `src/modules/builder/state/builder.store.ts`

Zustand store for all builder-related state. Decoupled from `gameStore` — only bridges via a `isEditMode` flag.

```typescript
interface BuilderState {
  // Mode
  isEditMode: boolean;
  
  // Catalog selection
  selectedCatalogItem: FurnitureDefinition | null;
  currentRotation: number;
  
  // Placed items (source of truth)
  placedItems: PlacedFurnitureItem[];
  occupancyGrid: OccupancyGrid;
  
  // Ghost cursor state
  ghostGridX: number;
  ghostGridY: number;
  ghostValid: boolean;  // green = valid, red = blocked
  
  // Undo/Redo
  undoStack: BuilderAction[];
  redoStack: BuilderAction[];
  
  // Persistence
  isSaving: boolean;
  lastSavedAt: number | null;
  isDirty: boolean;
  
  // Actions
  enterEditMode: () => void;
  exitEditMode: () => void;
  selectCatalogItem: (item: FurnitureDefinition) => void;
  clearSelection: () => void;
  rotateCurrent: () => void;
  updateGhostPosition: (gx: number, gy: number) => void;
  placeItem: () => void;
  removeItem: (instanceId: string) => void;
  moveItem: (instanceId: string, newGx: number, newGy: number) => void;
  undo: () => void;
  redo: () => void;
  loadLayout: (items: PlacedFurnitureItem[]) => void;
  saveLayout: () => Promise<void>;
}
```

#### [NEW] `src/modules/builder/state/builder-actions.ts`

Command pattern implementation for undo/redo. Each placement/removal/move is a reversible action.

```typescript
export type BuilderAction =
  | { type: 'PLACE'; item: PlacedFurnitureItem }
  | { type: 'REMOVE'; item: PlacedFurnitureItem }
  | { type: 'MOVE'; instanceId: string; fromGx: number; fromGy: number; toGx: number; toGy: number };
```

---

### Phase 14C: Coordinate Projection Layer — Grid Snapping & Collision

Extends the existing `isometric.ts` utilities with furniture-specific math.

---

#### [MODIFY] `src/modules/spatial/utils/isometric.ts`

Add new utility functions for furniture placement math. Existing functions are preserved.

**New exports:**
- `snapToGrid(sx, sy, layout): GridPoint` — snaps a screen coordinate to the nearest integer grid cell
- `getRotatedFootprint(footprint, rotation): [number, number]` — returns the footprint dimensions after applying rotation (0°, 90°, 180°, 270°)
- `getCellsOccupied(gx, gy, footprint): GridPoint[]` — returns all grid cells occupied by an item at (gx, gy) with the given footprint
- `getFurnitureScreenBounds(gx, gy, footprint, layout): { topLeft, topRight, bottomLeft, bottomRight }` — returns the screen-space bounding diamond for a multi-cell furniture item
- `getFurnitureDepth(gx, gy, footprint): number` — calculates the correct iso-sort depth for a furniture item based on its bottom-most occupied cell

#### [NEW] `src/modules/builder/utils/placement-validator.ts`

Validates whether a placement is legal given the current occupancy grid, grid bounds, and optional zone constraints.

```typescript
export interface PlacementValidation {
  isValid: boolean;
  reason?: 'OUT_OF_BOUNDS' | 'CELL_OCCUPIED' | 'OVERLAPS_ZONE' | 'BLOCKS_EXIT';
  conflictingItemIds?: string[];
}

export function validatePlacement(
  gx: number, gy: number,
  footprint: [number, number],
  grid: OccupancyGrid,
  gridBounds: { cols: number; rows: number },
  excludeInstanceId?: string,  // for move operations
): PlacementValidation { ... }
```

---

### Phase 14D: Visual Feedback Layer — Phaser Scene Enhancements

Upgrades `OfficeScene` from Graphics-only to a multi-layer sprite-based renderer with a live placement preview.

---

#### [NEW] `src/modules/builder/scenes/BuilderOverlayScene.ts`

A separate Phaser Scene that runs **on top of** `OfficeScene` (as a parallel scene). It handles all builder-mode visuals:

- **Ghost Sprite**: A semi-transparent furniture sprite that follows the cursor, snapping to grid lines. Tinted green when placement is valid, red when blocked.
- **Grid Highlight**: Highlights the cells that would be occupied by the current placement.
- **Selection Outlines**: Draws selection rectangles around placed items when hovered or clicked in edit mode.
- **Edit Mode Grid Overlay**: Draws a subtle grid overlay to help with alignment (hidden in play mode).

```typescript
export class BuilderOverlayScene extends Phaser.Scene {
  private ghostSprite: Phaser.GameObjects.Sprite | null = null;
  private cellHighlights: Phaser.GameObjects.Graphics;
  private gridOverlay: Phaser.GameObjects.Graphics;
  
  constructor() { super({ key: 'BuilderOverlayScene' }); }
  
  create() { ... }
  
  update() {
    // 1. Read mouse position from OfficeScene's camera
    // 2. Convert screen → grid via snapToGrid()
    // 3. Update ghost position and tint based on occupancy check
    // 4. Redraw cell highlights
  }
  
  /** Show/hide the entire builder overlay */
  setEditMode(active: boolean): void { ... }
  
  /** Update the ghost sprite to match the selected catalog item */
  setGhostItem(definition: FurnitureDefinition | null, rotation: number): void { ... }
}
```

#### [NEW] `src/modules/builder/entities/FurnitureSprite.ts`

A Phaser Container that renders a placed furniture item with proper isometric depth sorting.

```typescript
export class FurnitureSprite extends Phaser.GameObjects.Container {
  public readonly instanceId: string;
  public readonly catalogId: string;
  private sprite: Phaser.GameObjects.Sprite;
  private selectionOutline: Phaser.GameObjects.Graphics;
  
  constructor(
    scene: Phaser.Scene,
    instanceId: string,
    definition: FurnitureDefinition,
    gridX: number, gridY: number,
    rotation: number,
    layout: IsoLayout,
  ) { ... }
  
  /** Highlight this item when hovered in edit mode */
  setHighlighted(highlighted: boolean): void { ... }
  
  /** Highlight this item when selected for move/delete */
  setSelected(selected: boolean): void { ... }
  
  /** Update position after a move operation */
  updateGridPosition(newGx: number, newGy: number, layout: IsoLayout): void { ... }
}
```

#### [MODIFY] `src/modules/spatial/scenes/OfficeScene.ts`

Major modifications to support the builder:

1. **Add `preload()` method** — calls `preloadFurnitureAssets()` to load all texture atlases before `create()`.
2. **Replace `drawIsoFloor()`** — transition from Graphics primitives to a Tiled tilemap layer for the floor. Falls back to Graphics if no tilemap is loaded (backward compat).
3. **Replace `drawIsoZones()`** — render zones using sprites with tinted overlays instead of raw polygon fills. Zone labels remain as text.
4. **Add furniture rendering** — iterate `builderStore.placedItems` and spawn `FurnitureSprite` instances at the correct iso-sorted positions.
5. **Launch `BuilderOverlayScene`** — start it as a parallel scene (`this.scene.launch('BuilderOverlayScene')`).
6. **Subscribe to `builderStore`** — react to item placement/removal/move by adding/removing `FurnitureSprite` objects.
7. **Conditional input handling** — when `isEditMode` is true, suppress WASD movement and enable click-to-place / click-to-select interactions.

#### [NEW] `src/modules/builder/systems/FurnitureManager.ts`

Analogous to `PlayerManager` — bridges between the `builderStore` (state) and the Phaser scene (visuals). Subscribes to Zustand and manages `FurnitureSprite` lifecycle.

```typescript
export class FurnitureManager {
  private sprites: Map<string, FurnitureSprite> = new Map();
  private scene: Phaser.Scene;
  private unsubscribe: () => void;
  
  constructor(scene: Phaser.Scene) { ... }
  
  init(): void {
    // 1. Spawn sprites for all initially loaded placed items
    // 2. Subscribe to builderStore.placedItems changes
    //    - Diff added/removed items
    //    - Create/destroy FurnitureSprite instances accordingly
  }
  
  /** Re-sort all furniture sprites by iso depth */
  updateDepthSort(): void { ... }
  
  destroy(): void { ... }
}
```

---

### Phase 14E: Builder React UI — Catalog Panel, Toolbar & Edit Mode Toggle

The React overlay components that provide the builder interface.

---

#### [NEW] `src/modules/builder/ui/BuilderToolbar.tsx`

A floating toolbar visible only in Edit Mode. Contains:
- **Furniture catalog button** (opens the sidebar panel)
- **Rotate button** (90° clockwise)
- **Delete mode toggle** (click to remove placed items)
- **Undo / Redo buttons**
- **Save button** (persists layout to backend)
- **Exit Edit Mode button**

Styled with glassmorphism to match the existing HUD aesthetic.

#### [NEW] `src/modules/builder/ui/CatalogPanel.tsx`

A slide-out sidebar listing all available furniture items, grouped by `FurnitureCategory`. Each item shows:
- 64×64 thumbnail
- Name
- Footprint size (e.g., "2×1")
- Click to select → cursor becomes the ghost placement sprite

Includes category filter tabs and a search input.

#### [NEW] `src/modules/builder/ui/components/CatalogItem.tsx`

Individual furniture item card within the catalog. Shows hover states and selected states.

#### [MODIFY] `src/modules/spatial/ui/HUD.tsx`

Add an "Edit Office" button (visible only to `ORG_ADMIN` users) that toggles `builderStore.enterEditMode()`.

#### [MODIFY] `src/modules/spatial/ui/GameContainer.tsx`

1. Conditionally render `<BuilderToolbar />` and `<CatalogPanel />` when `isEditMode === true`.
2. Pass the `BuilderOverlayScene` to the Phaser config scene array.
3. Load the office layout (furniture placements) when the office is joined.

---

### Phase 14F: Backend — Furniture Persistence & Real-time Sync

Backend changes to persist furniture layouts and broadcast changes to connected clients.

---

#### [NEW] `libs/database/src/entities/furniture-placement.entity.ts`

```typescript
@Entity('furniture_placements')
export class FurniturePlacement extends BaseEntity {
  @Column()
  catalogId: string;         // References the frontend catalog definition ID

  @Column('float')
  gridX: number;

  @Column('float')
  gridY: number;

  @Column({ default: 0 })
  rotation: number;          // 0, 90, 180, or 270

  @Column('simple-json', { nullable: true })
  metadata: Record<string, unknown> | null;  // Future: custom labels, colors, etc.

  @ManyToOne(() => Office, { onDelete: 'CASCADE' })
  office: Office;
}
```

#### [MODIFY] `libs/database/src/entities/office.entity.ts`

Add the `OneToMany` relation to `FurniturePlacement`:
```typescript
@OneToMany(() => FurniturePlacement, (fp) => fp.office)
furniturePlacements: FurniturePlacement[];
```

#### [NEW] Backend REST endpoints (in `office.controller.ts` / `office.service.ts`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `GET /office/:id/furniture` | GET | JWT | Returns all furniture placements for an office |
| `PUT /office/:id/furniture` | PUT | JWT (Admin) | Bulk-replaces all furniture placements (full layout save) |
| `POST /office/:id/furniture` | POST | JWT (Admin) | Add a single furniture item |
| `DELETE /office/:id/furniture/:itemId` | DELETE | JWT (Admin) | Remove a single furniture item |

#### [NEW] Backend WebSocket events (in `office.gateway.ts`)

| Event | Direction | Payload |
|---|---|---|
| `furniture:placed` | Server → Room | `{ instanceId, catalogId, gridX, gridY, rotation }` |
| `furniture:removed` | Server → Room | `{ instanceId }` |
| `furniture:moved` | Server → Room | `{ instanceId, gridX, gridY, rotation }` |
| `furniture:layout-updated` | Server → Room | `{ placements: FurniturePlacement[] }` (full sync after bulk save) |

#### [MODIFY] Frontend socket types (`src/core/types.ts`)

Add `FurniturePlacement` interface and the new socket event types to `SocketServerToClientEvents` and `SocketRequestEvents`.

---

### Phase 14G: Asset Creation Pipeline & Tooling Guide

Documentation and tooling for creating Aseprite/Tiled assets compatible with the builder.

---

#### [NEW] `docs/asset-creation-guide.md`

Comprehensive guide covering:

1. **Aseprite Sprite Workflow**:
   - Canvas size conventions (multiples of tile size: 96×48 base)
   - Color palette standards
   - Export settings (PNG with transparency, 2× resolution for retina)
   - Naming conventions (`category-name-variant.ase` / `.png`)

2. **Tiled Tilemap Workflow**:
   - Tileset creation (matching `tileWidth: 96, tileHeight: 48`)
   - Isometric map orientation settings
   - Object layer conventions for zone definitions
   - Exporting as JSON for Phaser tilemap loader

3. **Texture Atlas Packing**:
   - Using free tools (TexturePacker free tier, ShoeBox, or `spritesheet-js`)
   - Output format: JSON Hash + PNG
   - Integrating with the Phaser atlas loader

4. **Placeholder Generation Script**:
   - A Node.js script (`scripts/generate-placeholders.ts`) that creates colored rectangle PNGs for every catalog item, enabling development before final art is ready.

---

### Phase 14H: Integration, Polish & Testing

---

#### Integration Tasks

1. **Edit Mode Input Isolation**: When `isEditMode` is true, `InputManager` disables WASD movement. The `BuilderOverlayScene` handles mouse events for placement. When exiting edit mode, movement resumes seamlessly.

2. **Depth Sort Integration**: Furniture sprites must participate in the same iso-depth sort as player sprites. The formula `depth = 10 + (gridX + gridY) * tileHeight + depthOffset` ensures players render in front of furniture they're walking past and behind furniture they're walking in front of.

3. **Collision Integration**: Furniture items with `blocksMovement: true` create invisible Phaser physics bodies that block player movement. These bodies are added/removed in sync with furniture placement.

4. **Multiplayer Sync**: When an admin places/removes furniture, the change is:
   - Optimistically applied to the local `builderStore`
   - Emitted via WebSocket to the backend
   - Broadcast to all clients in the office room
   - Other clients' `FurnitureManager` reacts to the store update and spawns/destroys sprites

5. **Save/Load Flow**:
   - On `office:join`, the backend includes `furniturePlacements` in the `office:state` payload
   - The frontend loads them into `builderStore` which triggers `FurnitureManager` to render all placed items
   - The "Save" button in the toolbar calls `PUT /office/:id/furniture` with the full placement array

---

#### File Summary — New & Modified Files

| File | Action | Layer |
|---|---|---|
| `src/modules/builder/catalog/furniture-catalog.ts` | NEW | Data |
| `src/modules/builder/catalog/default-catalog.ts` | NEW | Data |
| `src/modules/builder/catalog/asset-loader.ts` | NEW | Data |
| `src/modules/builder/state/occupancy-grid.ts` | NEW | Data |
| `src/modules/builder/state/builder.store.ts` | NEW | Data |
| `src/modules/builder/state/builder-actions.ts` | NEW | Data |
| `src/modules/builder/utils/placement-validator.ts` | NEW | Math |
| `src/modules/builder/scenes/BuilderOverlayScene.ts` | NEW | Visual |
| `src/modules/builder/entities/FurnitureSprite.ts` | NEW | Visual |
| `src/modules/builder/systems/FurnitureManager.ts` | NEW | Visual |
| `src/modules/builder/ui/BuilderToolbar.tsx` | NEW | UI |
| `src/modules/builder/ui/CatalogPanel.tsx` | NEW | UI |
| `src/modules/builder/ui/components/CatalogItem.tsx` | NEW | UI |
| `src/modules/spatial/utils/isometric.ts` | MODIFY | Math |
| `src/modules/spatial/scenes/OfficeScene.ts` | MODIFY | Visual |
| `src/modules/spatial/ui/HUD.tsx` | MODIFY | UI |
| `src/modules/spatial/ui/GameContainer.tsx` | MODIFY | UI |
| `src/core/types.ts` | MODIFY | Data |
| `public/assets/furniture/` | NEW | Assets |
| `docs/asset-creation-guide.md` | NEW | Docs |
| **Backend** | | |
| `libs/database/src/entities/furniture-placement.entity.ts` | NEW | Data |
| `libs/database/src/entities/office.entity.ts` | MODIFY | Data |
| `apps/aura-api/src/office/office.service.ts` | MODIFY | Data |
| `apps/aura-api/src/office/office.controller.ts` | MODIFY | Data |
| `apps/aura-realtime/src/gateways/office.gateway.ts` | MODIFY | Data |
| `apps/aura-realtime/src/contracts/realtime.types.ts` | MODIFY | Data |

---

## Execution Order

The implementation should proceed in this order to maintain a working system at each step:

```
Phase 14A ──► Phase 14B ──► Phase 14C ──┐
   (Assets)    (State)       (Math)      │
                                         ▼
                              Phase 14D (Phaser Visual Layer)
                                         │
                                         ▼
                              Phase 14E (React Builder UI)
                                         │
                                         ▼
                              Phase 14F (Backend Persistence)
                                         │
                                         ▼
                              Phase 14G (Asset Pipeline Docs)
                                         │
                                         ▼
                              Phase 14H (Integration & Testing)
```

Each sub-phase produces a testable increment:
- **14A**: Assets load into Phaser without errors
- **14B**: State management works in isolation (unit-testable)
- **14C**: Grid math produces correct coordinates (unit-testable)
- **14D**: Furniture renders on the isometric grid with correct depth sorting
- **14E**: Catalog panel appears, drag-to-place works visually
- **14F**: Layouts persist across page reloads
- **14G**: Team can author new furniture assets
- **14H**: Full end-to-end builder flow works with multiplayer sync

---

## Verification Plan

### Automated Tests

```bash
# Unit tests for OccupancyGrid
npx vitest run src/modules/builder/state/occupancy-grid.test.ts

# Unit tests for placement validation
npx vitest run src/modules/builder/utils/placement-validator.test.ts

# Unit tests for isometric math extensions
npx vitest run src/modules/spatial/utils/isometric.test.ts

# Backend furniture endpoint tests  
cd D:\Echofox\Project_Aura
npm run test -- --testPathPattern=office.service
```

### Manual Verification

1. **Asset Loading**: Launch the app → open DevTools → verify no 404s for furniture textures in the Network tab
2. **Edit Mode Toggle**: Log in as ORG_ADMIN → enter office → click "Edit Office" → verify the grid overlay appears and WASD is disabled
3. **Catalog Panel**: Open the catalog → verify all furniture items display with thumbnails and footprint info
4. **Ghost Placement**: Select a desk → move cursor over the grid → verify the ghost snaps to cells and turns green/red based on occupancy
5. **Place & Remove**: Click to place → verify the item appears at the correct iso position → select and delete → verify removal
6. **Rotation**: Select an item → press R or click rotate → verify footprint and sprite rotate correctly
7. **Undo/Redo**: Place 3 items → Ctrl+Z three times → verify all removed → Ctrl+Y → verify one restored
8. **Save/Load**: Place items → click Save → refresh the page → verify all items reload at correct positions
9. **Multiplayer Sync**: Open two browser tabs with different users → admin places furniture → verify it appears for the other user in real-time
10. **Depth Sorting**: Place a tall bookshelf → walk a player behind it → verify the player renders behind the bookshelf; walk in front → verify player renders in front
11. **Collision**: Place a desk with `blocksMovement: true` → try walking through it → verify the player is blocked
