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
| `scenes/OfficeScene.ts` | Main scene. Draws the iso floor and zones from `officeData` and `zones`, and owns the systems below plus `FurnitureManager`. Pointer input goes to desk hover and click in play mode, and to the builder in edit mode (`useBuilderStore.isEditMode`). It follows `navigationTarget` (go to my desk) and converts the local player's screen position to grid units before sending movement. |
| `systems/InputManager.ts` | WASD and arrow keys produce screen-space velocity (200 px/s). |
| `systems/NetworkManager.ts` | Registers every `socketService.on` listener (`player:*`, `zone:*`, `meeting:*`, `screenshare:*`, `media:state`, `desk:updated`, `furniture:*`) and routes the payloads into stores. `emitMove` is throttled to about 15 Hz. It also has the ack helpers `assignDesk`, `unassignDesk` and `goToMyDesk`, and `destroy()` removes all listeners. |
| `systems/PlayerManager.ts` | Syncs the `players` in the store to `PlayerSprite`s, placing them with `gridToScreen`. Remote players interpolate toward `setTargetPosition`, and the local player moves on its own. |
| `systems/ProximitySystem.ts` | Every 500 ms it sets the volume of each remote user: full within 1.5 tiles, fading out to zero at 6 tiles. This only adjusts volume, because the server decides which streams arrive. |
| `systems/MeetingSystem.ts` | While in a meeting, it stops proximity and sets participants to full volume. |
| `entities/PlayerSprite.ts` | Avatar container (preset and palette colours, name label). |
| `utils/isometric.ts` | **All coordinate math**: `buildIsoLayout`, `gridToScreen`, `screenToGrid`, `snapToGrid`, tile, zone and furniture diamonds, depth sorting and polygon hit-tests. |
| `utils/avatar-presets.ts` | Avatar presets and palettes. They must match the backend `@app/common/avatar`. |
| `utils/desk-panel-bridge.ts` | Hands the scene's `NetworkManager` to the React `DeskPanel`. |
| `ui/HUD.tsx` | Overlay that holds `ZoneBadge`, `UserPill` (which opens `ProfileSidebar`), `DeskPanel`, `PresenceCounter`, `MediaToolbar`, `Minimap`, and the "Edit Office" button for ORG_ADMIN. |
| `ui/MeetingOverlay.tsx`, `ui/components/VideoTile.tsx` | Meeting grid with camera and screen tiles, driven by `media.store` `remoteMedia`. |
| `ui/ProximityIndicator.tsx` | Shows who is nearby. |

## Rules

- Positions in stores and on the wire are **grid units**. Use the helpers in `isometric.ts` and do not hand-roll projection math.
- Depth sorting uses `isoDepth` and `furnitureDepth`. New world objects must set depth the same way or they will overlap incorrectly.
- Register a listener in `NetworkManager.init()` and remove it in `destroy()`. Leaked listeners duplicate events after a reconnect.
- The server detects zones. The client does not compute zone entry, apart from desk hover UI.
- Keep `PROXIMITY_RADIUS` in line with the backend `SFU_PROXIMITY_RADIUS`. The backend is currently 300, a stale pixel value, so
  the server sends media from the whole office and this system only mutes it.

## Gaps

- There is no collision with furniture or walls yet, so players walk through objects. The builder's `OccupancyGrid` could provide it.
- Avatars are coloured shapes. The plan calls for animated sprite sheets.
