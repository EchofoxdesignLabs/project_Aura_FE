# modules/builder — runtime office builder

Lets an ORG_ADMIN place, move, rotate and remove furniture on the isometric grid. Changes sync live to everyone in the office.
The design doc is `docs/phase-14-runtime-office-builder.md`. Art follows the Aura Asset Rulebook (`docs/Aura Asset Rulebook.docx`)
and comes from the Aura_Assets pipeline (`npm run assets:sync`).

## Data flow

```
HUD "Edit Office" → builder.store.enterEditMode()
CatalogPanel → selectCatalogItem()
BuilderOverlayScene (pointer) → updateGhostPosition() → validatePlacement() → ghostValid
click → placeItem() → undoStack push + placedItems + occupancy grid → safeEmit('furniture:place')
FurnitureManager (subscribes to placedItems) → spawns/updates/destroys FurnitureSprite in OfficeScene
remote clients: NetworkManager 'furniture:placed|removed|moved' → remotePlaceItem/remoteRemoveItem/remoteMoveItem → FurnitureManager
join/reconnect: GameContainer → loadLayout(state.furniture, gridWidth, gridHeight)
```

## Files

| Path | Role |
|------|------|
| `catalog/furniture-catalog.ts` | `FurnitureDefinition` (id, category, footprint `[cols, rows]`, rotations, texture key, and so on), `PlacedFurnitureItem`, and the rotated-footprint and occupied-cell helpers. |
| `catalog/default-catalog.ts` | `DEFAULT_CATALOG` plus lookups. Catalog **ids are persisted** in the backend as `catalogId`, so never rename or remove an id without migrating saved layouts. |
| `catalog/furniture-art.ts` | Reads `furniture.manifest.json` (written by `assets:sync`) and loads the sheets from `public/assets/furniture/sheets/`. Resolves a rotation to the drawn view, flip and anchor: 0° = view-se, 180° = view-nw, and 90° / 270° are those mirrored (R-15). |
| `catalog/asset-loader.ts` | Fallback placeholder boxes (same canvas and anchor rules) for items without a sheet, and fallback thumbnails. |
| `state/builder.store.ts` | Zustand store and **source of truth** for `placedItems`, selection, ghost, undo and redo (max 50). Emits socket events through `safeEmit`, which does nothing when disconnected. |
| `state/occupancy-grid.ts` | Two layers, floor and surface, mapping each cell to an instanceId for placement checks. Surface items (`placement: 'surface'`, for example the monitor) may share cells with a host that has `surfaceHeight` (desks, tables). Rebuilt on `loadLayout`. |
| `state/builder-actions.ts` | Place, remove, move and rotate actions, plus `invertAction` for undo. |
| `utils/placement-validator.ts` | Bounds and overlap validation, returning a reason code. |
| `scenes/BuilderOverlayScene.ts` | Phaser scene launched on top of `OfficeScene` in edit mode. Handles the ghost preview, grid highlight and pointer input. |
| `systems/FurnitureManager.ts` | Turns store state into `FurnitureSprite`s. On every change it lifts surface items onto their host, sets sort keys (decals at the bottom), registers `DepthSorter` occluders and reports the layout so `OfficeScene` can update collision. Sort keys start from the footprint's front tip; items that overlap on screen are then put in footprint order (topological sort), so a long divider never draws over the desk in front of it. |
| `entities/FurnitureSprite.ts`, `entities/furniture-visual.ts` | Container on the footprint's top tip holding the item's images (base and front for seats), with highlight, selection and fade. The builder ghost uses the same `createFurnitureImages`. |
| `ui/BuilderToolbar.tsx`, `ui/CatalogPanel.tsx`, `ui/components/CatalogItem.tsx` | React UI: tools, rotate, undo, redo, exit, and the category catalog. |

## Rules and gotchas

- **Updates are optimistic with no rollback.** The server enforces ORG_ADMIN and may reject with a `WsException`, but the local store
  has already changed. When you harden this, switch to `socketService.request` (acks) and revert on error.
- `instanceId` is a client-generated UUID that becomes the DB primary key.
- Furniture with `blocksMovement` blocks avatars through `CollisionGrid`. Surface items never block.
- Seats: items whose manifest entry has a `seat` point (chairs) can be sat on. `FurnitureSprite.getSeatPose()` gives the feet
  position, facing (0° se, 90° sw, 180° nw, 270° ne) and depth. The seat's front layer is a separate container just above
  the base, so the avatar draws between them.
- Desks are claimable because the backend gives every desk item its own desk zone (backend `desk-zones.ts`). A new desk
  catalog id must also be added to the backend's `DESK_FOOTPRINTS`.
- Removing a host leaves its surface items standing on the floor.
- A new catalog item needs a matching manifest entry and sheet from Aura_Assets. Without one it renders as a placeholder box.
- The backend also exposes `PUT /office/:id/furniture` for bulk save, which is unused. A "Save/Discard" flow would use it, and needs
  a `put` method added to `apiClient`.
- Undo and redo emit the inverse socket events, so remote clients stay consistent.
