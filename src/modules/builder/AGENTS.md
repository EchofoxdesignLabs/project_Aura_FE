# modules/builder — runtime office builder

Lets an ORG_ADMIN place, move, rotate and remove furniture on the isometric grid. Changes sync live to everyone in the office.
The design doc is `docs/phase-14-runtime-office-builder.md`, and the art pipeline is in `docs/asset-creation-guide.md`.

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
| `catalog/asset-loader.ts` | Generates placeholder iso textures and thumbnails on canvas. `preloadFurnitureAssets` is a stub until real art lands in `public/assets/furniture/`. |
| `state/builder.store.ts` | Zustand store and **source of truth** for `placedItems`, selection, ghost, undo and redo (max 50). Emits socket events through `safeEmit`, which does nothing when disconnected. |
| `state/occupancy-grid.ts` | Maps each cell to an instanceId for collision checks. Rebuilt on `loadLayout`. |
| `state/builder-actions.ts` | Place, remove, move and rotate actions, plus `invertAction` for undo. |
| `utils/placement-validator.ts` | Bounds and overlap validation, returning a reason code. |
| `scenes/BuilderOverlayScene.ts` | Phaser scene launched on top of `OfficeScene` in edit mode. Handles the ghost preview, grid highlight and pointer input. |
| `systems/FurnitureManager.ts` | Turns store state into `FurnitureSprite`s. |
| `entities/FurnitureSprite.ts` | Sprite container with highlight, selection and depth handling. |
| `ui/BuilderToolbar.tsx`, `ui/CatalogPanel.tsx`, `ui/components/CatalogItem.tsx` | React UI: tools, rotate, undo, redo, exit, and the category catalog. |

## Rules and gotchas

- **Updates are optimistic with no rollback.** The server enforces ORG_ADMIN and may reject with a `WsException`, but the local store
  has already changed. When you harden this, switch to `socketService.request` (acks) and revert on error.
- `instanceId` is a client-generated UUID that becomes the DB primary key.
- Furniture does not yet block avatar movement.
- The backend also exposes `PUT /office/:id/furniture` for bulk save, which is unused. A "Save/Discard" flow would use it, and needs
  a `put` method added to `apiClient`.
- Undo and redo emit the inverse socket events, so remote clients stay consistent.
