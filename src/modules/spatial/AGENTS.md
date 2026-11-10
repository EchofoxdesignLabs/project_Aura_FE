# modules/spatial — the isometric world

The Phaser game, the realtime sync for players, zones, meetings and desks, client-side proximity audio, and the React HUD drawn
over the canvas.

## Boot (`ui/GameContainer.tsx`)

1. Creates the `Phaser.Game` with `OfficeScene`. The scene then adds and launches `BuilderOverlayScene` itself.
2. On every socket connect, it emits `office:join` and applies `office:state` to the game store, and loads `state.furniture` into the
   builder store (`loadLayout`).
3. Sends `presence:heartbeat` every 15 s. The server TTL is 30 s.
4. Initializes `sfuManager` and media (`initMedia`). Tears everything down on unmount.
5. Renders `HUD`, plus `BuilderToolbar`, `CatalogPanel`, `ProximityIndicator` and `MeetingOverlay` once the engine is ready.

## Files

| Path | Role |
|------|------|
| `scenes/OfficeScene.ts` | Main scene. `preload()` queues the office's Tiled map, furniture sheets and avatar sheets. `create()` draws the map, zone labels and players and owns the systems below plus `FurnitureManager`. Pointer input goes to desk hover and click in play mode, and to the builder in edit mode (`useBuilderStore.isEditMode`). The local player moves by position through `CollisionGrid.resolveMove`, and `navigationTarget` (go to my desk) walks an A* path. Positions are converted to grid units before sending. |
| `systems/OfficeMapRenderer.ts` | Loads `public/assets/maps/<mapKey>.tmj` and its tileset images, and draws them. Flat tile layers (floor) go under everything. Tall tile layers (walls) are one image per tile, depth-sorted and registered with `DepthSorter`. Builds the `CollisionGrid` from the hidden `collision` layer. Offices without a `mapKey` get a plain floor. |
| `systems/CollisionGrid.ts` | Grid-space collision. Wall edges come from the map. Solid cells come from blocking furniture (`setSolids`, fed by `FurnitureManager`). Provides `resolveMove` (slides along walls), `findPath` (A*) and `nearestFreeCell`. `CollisionDebugOverlay` draws it (**F2**). |
| `systems/DepthSorter.ts` | Furniture and wall tiles register occluders (grid box, sort key, screen rect). Avatar depth is solved against the occluders it overlaps, so people sort correctly beside long desks and behind glass. Also fades tall furniture that hides your own avatar (R-35). |
| `systems/CameraController.ts` | Zoom steps 3×, 2×, 1× (default) and ½× from the mouse wheel or + / −, whole-pixel rounding, and bounds that centre a small office (R-06 to R-09). |
| `systems/InputManager.ts` | WASD and arrow keys produce screen-space velocity (`AVATAR_WALK_SPEED`, 200 px/s). Two keys move along a tile edge (2:1), not at 45° (R-17). |
| `systems/NetworkManager.ts` | Registers every `socketService.on` listener (`player:*`, `zone:*`, `meeting:*`, `screenshare:*`, `media:state`, `desk:updated`, `furniture:*`) and routes the payloads into stores. `emitMove` is throttled to about 15 Hz. It also has the ack helpers `assignDesk`, `unassignDesk` and `goToMyDesk`, and `destroy()` removes all listeners. |
| `systems/PlayerManager.ts` | Syncs the `players` in the store to `PlayerSprite`s, placing them with `gridToScreen`. Remote players interpolate toward `setTargetPosition`, and the local player moves on its own. |
| `systems/ProximitySystem.ts` | Every 500 ms it sets the volume of each remote user: full within 1.5 tiles, fading out to zero at 6 tiles. This only adjusts volume, because the server decides which streams arrive. |
| `systems/MeetingSystem.ts` | While in a meeting, it stops proximity and sets participants to full volume. |
| `entities/PlayerSprite.ts` | One avatar: the engine-drawn shadow with a preset-colour ring, the animated sheet, and a name tag kept at screen size above the world. Facing comes from movement; walk playback follows speed. |
| `entities/avatar-animations.ts` | Loads Aseprite avatar sheets and creates one animation per tag, keyed `<sheet>:<tag>` (for example `avatar-placeholder-01:walk-se`). e, sw and ne play w, se and nw flipped (R-14). |
| `utils/isometric.ts` | **All coordinate math**: `buildIsoLayout` (always 64×32 art tiles, with wall headroom), `gridToScreen`, `screenToGrid`, `snapToGrid`, tile, zone and furniture diamonds, `DEPTH` bands and sort keys, and polygon hit-tests. `gridToScreen(x, y)` is the **top vertex** of cell (x, y). |
| `utils/tiled-map.ts` | Tiled `.tmj` types and gid, tileset and property lookups. |
| `utils/avatar-presets.ts` | Avatar presets and palettes. They must match the backend `@app/common/avatar`. |
| `utils/desk-panel-bridge.ts` | Hands the scene's `NetworkManager` to the React `DeskPanel`. |
| `ui/HUD.tsx` | Overlay that holds `ZoneBadge`, `UserPill` (which opens `ProfileSidebar`), `DeskPanel`, `PresenceCounter`, `MediaToolbar`, `Minimap`, and the "Edit Office" button for ORG_ADMIN. |
| `ui/MeetingOverlay.tsx`, `ui/components/VideoTile.tsx` | Meeting grid with camera and screen tiles, driven by `media.store` `remoteMedia`. |
| `ui/ProximityIndicator.tsx` | Shows who is nearby. |

## Rules

- Positions in stores and on the wire are **grid units**. Use the helpers in `isometric.ts` and do not hand-roll projection math.
- Depth: world objects use `depthForKey(key)`, where key = gx + gy of their front-most ground point (`footprintSortKey` for
  footprints). Anything that should hide or be hidden by avatars must register with `DepthSorter`. Labels use `DEPTH.ZONE_LABEL`
  or `DEPTH.NAME_TAG` and are counter-scaled by 1 / zoom.
- Art comes from the asset pipeline (`npm run assets:sync`, see the root guide). Load files with `assetUrl()` and never with
  absolute `/assets/...` paths, which break under Electron's `file://`.
- Keys added with `addKey(code, false)` do not capture, so they still type into React inputs. Use that for anything but movement.
- Register a listener in `NetworkManager.init()` and remove it in `destroy()`. Leaked listeners duplicate events after a reconnect.
- The server detects zones. The client does not compute zone entry, apart from desk hover UI.
- Keep `PROXIMITY_RADIUS` in line with the backend `SFU_PROXIMITY_RADIUS`. The backend is currently 300, a stale pixel value, so
  the server sends media from the whole office and this system only mutes it.

## Gaps

- Avatars are one composite placeholder sheet. Layered avatars (body, top, hair) and key-ramp recolouring (R-39 to R-43) are
  not built yet, so `avatarConfig.presetId` only colours the shadow ring.
- `sit`, `work` and `wave` animations are loaded but unused. Seats have base and front layers ready for sitting (R-24).
- Remote avatars are not collision-checked, because the client trusts each player's own position.
- The server spawns at the lobby centre. On `aura-office-01` that is the reception desk, so the client steps to the nearest free cell.
