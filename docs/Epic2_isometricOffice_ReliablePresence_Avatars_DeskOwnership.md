# Epic 2: Isometric Office, Reliable Presence, Avatars & Desk Ownership — Implementation Plan

## Goal

Upgrade Project Aura from a top-down POC office into a reliable isometric virtual office foundation. This epic fixes stale online users, adds preset avatars, introduces a true isometric grid renderer, and makes desks assignable with “Go to my desk” navigation.

> [!IMPORTANT]
> **Stale-users bug root cause:** The current `redis.service.ts` stores player presence via `hSet` on `office:{officeId}:players` with **no TTL or expiry**. The `office.gateway.ts` `handleDisconnect` only fires on clean Socket.IO disconnections. If a browser tab is killed, the network drops, or the server restarts, the hash entry is never cleaned up — causing ghost players to appear indefinitely. This is a **backend-only bug** fixed in Phase 2A.

## Scope

### Implementing Now

| Phase | Description |
|-------|-------------|
| **2A** | Backend presence reliability — Redis TTL presence, socket ownership, heartbeat |
| **2B** | Backend avatar/user profile APIs — avatar config in auth/profile/user list/player state |
| **2C** | Backend office/desk model — isometric office metadata, neutral desks, assignments |
| **2D** | Backend realtime desk events — assign, unassign, go-to-mine, live updates |
| **2E** | Frontend contract/store updates — types, game store, auth store, socket events |
| **2F** | Frontend avatar onboarding/profile UI — preset picker and profile sidebar |
| **2G** | Frontend isometric Phaser renderer — true logical grid projection |
| **2H** | Frontend desk UI and navigation — claim/release desks and auto-walk |
| **2I** | Tests, docs, verification, and polish |

### Deferred

| Phase | Description | Why Deferred |
|-------|-------------|--------------|
| **2J** | Full character builder with layered body/hair/outfit/accessories | Preset avatars establish the storage/API contract first |
| **2K** | Final office art, spritesheets, and tilesets | Current goal is art-ready isometric placeholders |
| **2L** | Admin office layout editor | Desk assignment is needed before layout authoring |
| **2M** | Multi-office persistent last position | Useful later, not required for reliable current-room presence |

## Current State

- Frontend office rendering is top-down Phaser rectangles and circle avatars (OfficeScene draws a `Phaser.add.grid` + `fillRect`/`strokeRect` zones).
- PlayerSprite renders a simple `Phaser.GameObjects.Arc` (circle) with a hash-color for remote users and cyan for local.
- Backend `office:state` gets players from Redis hash `office:{officeId}:players` via `hGetAll` — **no TTL, no expiry**.
- `handleDisconnect` in `office.gateway.ts` calls `removePlayerOnline` only on clean socket close — abrupt exits leave ghosts.
- `Zone.assignedUserId` column already exists in `zone.entity.ts`, but no REST/realtime desk assignment API uses it.
- `User.avatarConfig` column already exists as JSONB in `user.entity.ts`, but onboarding/login/player state do not expose or use it.
- Default office seed in `office.service.ts` (`aura-api`) hardcodes desk names like `Desk - Alice` and uses top-down pixel coordinates.
- Frontend `InputManager.ts` emits raw pixel velocity; `NetworkManager.ts` throttles `player:move` at ~15 fps.
- The `socket.service.ts` has `onConnect`/`onDisconnect`/`onError` hooks but they are not wired to any reconnect or heartbeat logic.
- Auth store persists `{ id, name, role, company }` — no `avatarConfig` field.
- `OfficeZoneSnapshot` (backend `realtime.types.ts`) picks `id | name | type | x | y | width | height` from Zone — does not include `assignedUserId`.
- `PlayerState` (backend `redis.types.ts`) has no `avatarConfig` field.

## User Review Required

> [!WARNING]
> **Breaking spatial contract change**: office/player/zone coordinates move from pixel-first top-down coordinates to logical isometric grid coordinates. Frontend and backend must be updated together so movement, zone detection, minimap, and desk anchors all use the same coordinate system.

## Proposed Changes

### Backend Changes (`D:\Echofox\project-aura`)

---

#### Phase 2A: Reliable Presence Foundation

##### [MODIFY] Redis presence model

- Replace hash-only presence reads with expiring per-user presence records.
- Maintain an office online index for discoverability.
- Add TTL refresh on join, heartbeat, movement, media state, zone transitions, and desk navigation.
- Filter expired/missing player records before returning `office:state`.

##### [MODIFY] `libs/redis/src/redis.service.ts`

- Add presence key helpers:
  - `office:{officeId}:presence:{userId}` — a STRING key with value = JSON `{ socketId, userId, officeId }`, set with `EX` (e.g. 30s TTL).
  - `office:{officeId}:online` — a SET of userIds for quick membership checks.
- Add `touchPlayerPresence(officeId, userId, socketId, ttlSeconds)` — `SET ... EX` + `SADD online`.
- Add `removePlayerOnlineIfSocketMatches(officeId, userId, socketId)` — GET presence key, compare socketId, if matching then DEL + SREM.
- Add `getActivePlayersInOffice(officeId)` — SMEMBERS of online set, batch-check presence keys exist, prune expired members (SREM stale), return active userIds.
- Keep existing `office:{officeId}:players` hash for full PlayerState storage (position, zone, media). Presence TTL key is a separate liveness signal.
- Keep existing `setPlayerOnline`, `removePlayerOnline`, `getPlayersInOffice`, etc. but modify `getPlayersInOffice` to cross-reference presence keys and exclude expired entries.

##### [MODIFY] `apps/aura-realtime/src/gateways/office.gateway.ts`

- On `office:join`:
  - Check if a presence key already exists for this userId. If yes, the old socket is stale — emit `player:left` to the room on behalf of the old socket, then overwrite.
  - Call `touchPlayerPresence` to set the new TTL key with the new `socketId`.
- On `handleDisconnect`:
  - Call `removePlayerOnlineIfSocketMatches` — only removes presence if stored `socketId` matches the disconnecting socket. This prevents a new login's presence from being deleted by a stale disconnect.
- Add a guard helper `ensureActiveSocket(client)` that compares `client.id` against the stored presence socketId. Use it in `player:move`, `media:state`, `screenshare:*`, and desk event handlers to silently reject stale sockets.
- Add `@SubscribeMessage('presence:heartbeat')` handler that calls `touchPlayerPresence` to refresh TTL.
- Touch presence TTL from `player:move` and `media:state` handlers as well (piggyback on existing traffic to reduce standalone heartbeat frequency).
- Emit `player:left` only when the active socket truly leaves (socket matches).

---

#### Phase 2B: Avatar and User Profile APIs

##### [MODIFY] `libs/database/src/entities/user.entity.ts`

- Keep existing `avatarConfig: any` JSONB column.
- Standardize v1 shape: `{ version: 1, presetId: string, paletteId: string }`.
- Backend validates against a known list of preset/palette IDs.
- Default avatar assigned if omitted (e.g. `{ version: 1, presetId: 'default-1', paletteId: 'blue' }`).

##### [MODIFY] auth DTOs and services

- `apps/aura-api/src/auth/dtos/` — Add optional `avatarConfig` field to:
  - `RegisterCompanyDto` (for the admin user created during registration).
  - Invite accept DTO (currently `{ name, password }` — add optional `avatarConfig`).
- `apps/aura-api/src/auth/services/` — Auth service changes:
  - On register-company: persist `avatarConfig` on the new admin User entity (or default).
  - On invite accept: persist `avatarConfig` on the new User entity (or default).
  - On login: include `avatarConfig` in the `LoginResponse.user` object (currently returns `{ id, name, role, company }`).

##### [NEW] Users module (`apps/aura-api/src/users/`)

- New NestJS module with controller + service.
- `GET /users` — returns all users in the authenticated user's company (for sidebar user list). Include `{ id, name, avatarConfig, lastOfficeId }` per user.
- `GET /users/me` — returns authenticated user's full profile.
- `PATCH /users/me/avatar` — validates `avatarConfig` against supported preset/palette IDs, persists, returns updated user.
- All routes protected by JwtAuthGuard.

##### [MODIFY] realtime player state

- `libs/redis/src/redis.types.ts` — Add `avatarConfig?: { version: number; presetId: string; paletteId: string }` to `PlayerState`.
- `apps/aura-realtime/src/contracts/realtime.types.ts` — `OfficeStatePayload.players` will now carry avatar data.
- `apps/aura-realtime/src/gateways/office.gateway.ts` — In `handleOfficeJoin`, read `currentUser.avatarConfig` from the DB user entity and include it in the `PlayerState` written to Redis.

---

#### Phase 2C: Office and Desk Model

##### [MODIFY] `libs/database/src/entities/office.entity.ts`

- Add isometric layout metadata columns:
  - `layoutMode: string` — default `'isometric'` (future-proofs for `'topdown'` legacy).
  - `gridWidth: number` — logical grid columns (e.g. 30).
  - `gridHeight: number` — logical grid rows (e.g. 20).
  - `tileWidth: number` — pixel width of one isometric tile (e.g. 64).
  - `tileHeight: number` — pixel height of one isometric tile (e.g. 32).
- Keep existing `width` and `height` columns for backward compat (can be derived but useful for REST responses).

##### [MODIFY] `libs/database/src/entities/zone.entity.ts`

- Add desk anchor columns (the position a player walks to when navigating to their desk):
  - `anchorX: float, nullable` — logical grid X of the chair/standing position.
  - `anchorY: float, nullable` — logical grid Y of the chair/standing position.
- Zone `x`, `y`, `width`, `height` will now represent **logical grid coordinates** rather than pixel coordinates.
- Keep existing `assignedUserId` column for desk ownership.

##### [MODIFY] `apps/aura-api/src/office/office.service.ts`

- Replace `DEFAULT_OFFICE_CONFIG` top-down pixel layout with an isometric logical grid seed.
- Use logical grid coordinates for all zone positions (e.g. desk at grid `{x: 2, y: 8, width: 3, height: 2}`).
- Rename hardcoded personal desks to neutral names: `Desk 01`, `Desk 02`, etc.
- Seed desk anchors (`anchorX`, `anchorY`) at the front of each desk zone.
- Set isometric metadata on the seeded office: `layoutMode: 'isometric'`, `gridWidth: 30`, `gridHeight: 20`, `tileWidth: 64`, `tileHeight: 32`.

##### [MODIFY] office responses / realtime types

- `apps/aura-realtime/src/contracts/realtime.types.ts`:
  - `OfficeZoneSnapshot` must include `assignedUserId`, `anchorX`, `anchorY`.
  - Add `OfficeLayoutMetadata` type: `{ layoutMode, gridWidth, gridHeight, tileWidth, tileHeight }`.
  - `OfficeStatePayload` must include layout metadata.
- `apps/aura-api/src/office/office.controller.ts` — ensure REST responses also include layout metadata and desk fields.
- `apps/aura-realtime/src/gateways/office.gateway.ts` — `toZoneSnapshots` must pick `assignedUserId`, `anchorX`, `anchorY` from Zone entities.

---

#### Phase 2D: Desk Assignment Realtime/API

##### [MODIFY] office service

- Add desk assignment operations:
  - assign desk to current user
  - unassign own desk
  - admin assign desk to user
  - admin clear any desk
  - find current user’s assigned desk

##### [MODIFY] `office.gateway.ts`

- Add `desk:assign`.
- Add `desk:unassign`.
- Add `desk:go-to-mine`.
- Broadcast `desk:updated` to the office room after every successful assignment change.
- Validate:
  - desk belongs to current office/company,
  - zone type is `PRIVATE_DESK`,
  - normal users can only claim/release their own desk,
  - admins can override,
  - one desk per user per office.

##### [OPTIONAL REST SUPPORT]

- Add REST equivalents under protected office routes if needed for sidebar reloads:
  - `POST /office/:officeId/desks/:zoneId/assign`
  - `DELETE /office/:officeId/desks/:zoneId/assignment`
  - `GET /office/:officeId/desks/mine`

---

### Frontend Changes (`D:\Echofox\project-aura-fe`)

---

#### Phase 2E: Contracts, Stores, and Socket Events

##### [MODIFY] `src/core/types.ts`

- Add `AvatarConfig` type: `{ version: number; presetId: string; paletteId: string }`.
- Add `avatarConfig?: AvatarConfig` to `AuthUser`, `PlayerState`.
- Add optional `avatarConfig` to `RegisterCompanyRequest`, `AcceptInviteRequest`.
- Add `OfficeLayoutMetadata`: `{ layoutMode, gridWidth, gridHeight, tileWidth, tileHeight }`.
- Add layout metadata to `Office` / `OfficeWithZones` types.
- Add `assignedUserId`, `assignedUserName`, `anchorX`, `anchorY` to `ZoneSnapshot`.
- Add to `SocketClientToServerEvents`:
  - `'presence:heartbeat': () => void`
  - `'desk:assign': (payload: { zoneId: string }) => void`
  - `'desk:unassign': (payload: { zoneId: string }) => void`
  - `'desk:go-to-mine': () => void`
- Add to `SocketServerToClientEvents`:
  - `'desk:updated': (payload: DeskUpdatedPayload) => void`
  - `'desk:go-to-mine:ack': (payload: { anchorX: number; anchorY: number } | { error: string }) => void`
- Add `DeskUpdatedPayload`: `{ zoneId, assignedUserId, assignedUserName }`.

##### [MODIFY] `src/core/store/auth.store.ts`

- Add `avatarConfig` to `AuthState` and `AuthUser`.
- Update `isAuthUser` validator to accept optional `avatarConfig`.
- Add `updateAvatar(avatarConfig)` action that calls `PATCH /users/me/avatar`, then updates local state and `localStorage`.
- Update `persistAuth` / `hydrate` to include `avatarConfig`.

##### [MODIFY] `src/core/store/game.store.ts`

- Add `OfficeLayoutMetadata` to `GameStoreData` (stored alongside `officeData`).
- Add `selectedDeskZoneId: string | null` and `hoveredDeskZoneId: string | null`.
- Add `updateDeskAssignment(zoneId, assignedUserId, assignedUserName)` — mutates only the target zone in `zones[]`.
- Add `navigationTarget: { x: number; y: number } | null` for "Go to my desk" guided movement.
- Add `connectionStatus: 'connected' | 'reconnecting' | 'disconnected'`.
- Update `setOffice` to accept and store layout metadata.

##### [MODIFY] `src/core/services/socket.service.ts`

- Add `request` support for `desk:go-to-mine` (already has generic `request` method, just needs typing in `SocketRequestEvents`).
- No structural changes needed — the existing `onConnect`/`onDisconnect` hooks are sufficient.

##### [NEW] Heartbeat interval (frontend)

- In `GameContainer.tsx` or a dedicated `PresenceService`, start a `setInterval` (every 15s) that emits `presence:heartbeat` while the socket is connected.
- Clear interval on unmount / disconnect.
- This ensures presence TTL stays refreshed even if the user is idle (not moving).

---

#### Phase 2F: Avatar Onboarding and Profile Sidebar

##### [NEW] Avatar preset catalog

- Create shared frontend preset catalog with stable IDs.
- Include visual placeholder data:
  - body color
  - accent color
  - face/hair token or initials style

##### [MODIFY] `RegisterForm.tsx`

- Add avatar preset selection to company registration.
- Submit selected `avatarConfig`.

##### [MODIFY] `InviteAcceptScreen.tsx`

- Add avatar preset selection before accepting invite.
- Submit selected `avatarConfig`.

##### [NEW] Profile sidebar

- Add HUD profile button.
- Sidebar shows current user profile, avatar preview, and avatar preset picker.
- Save avatar changes via `PATCH /users/me/avatar`.
- Update local auth state and local player state after save.

---

#### Phase 2G: Isometric Phaser Renderer

##### [NEW] isometric utility module

- Add `worldToScreen(gridX, gridY, layout)`.
- Add `screenToWorld(screenX, screenY, layout)`.
- Add zone polygon helpers for diamond rendering.
- Add unit-testable pure functions.

##### [MODIFY] `OfficeScene.ts`

- Render diamond isometric floor tiles from `gridWidth` and `gridHeight`.
- Render zones as isometric polygons.
- Render desk zones with distinct placeholder styling.
- Use depth sorting based on grid position.
- Keep camera follow behavior centered on projected player position.
- Replace top-down grid and rectangles.

##### [MODIFY] `InputManager.ts`

- Convert WASD/arrow movement into logical grid-space velocity.
- Keep existing movement feel, but update emitted coordinates to logical world coordinates.

##### [MODIFY] `PlayerSprite.ts`

- Render preset avatar token instead of simple body circle.
- Reproject logical position to screen position each frame.
- Depth-sort by logical `x + y`.
- Keep labels readable above avatars.

##### [MODIFY] `Minimap.tsx`

- Render isometric footprint and zones using the same projection helpers.
- Draw players and desk anchors in matching projected space.

---

#### Phase 2H: Desk UI and “Go To My Desk”

##### [MODIFY] Phaser desk interaction

- Detect pointer hover/click on desk polygons.
- Store selected desk in `game.store`.
- Highlight hovered and selected desk.

##### [NEW] Desk panel/sidebar section

- Show selected desk name and assignment status.
- Actions:
  - claim unassigned desk,
  - release own desk,
  - admin assign/clear,
  - go to my desk.
- Show empty state when no desk is selected.
- Show “No desk assigned” state for go-to-mine.

##### [MODIFY] `NetworkManager.ts`

- Listen for `desk:updated` and update zone assignment in store.
- Add methods to emit desk assign/unassign/go-to-mine.
- Listen for authoritative movement/teleport response if backend sends desk target.

##### [MODIFY] movement/navigation system

- Add click-to-target style guided movement for `desk:go-to-mine`.
- Move local player toward returned desk anchor.
- Continue emitting normal `player:move` updates while walking.

---

## Step-by-Step Task Breakdown

### Backend Tasks

| # | Task | Files | Phase |
|---|------|-------|-------|
| B1 | Add Redis TTL presence records, online index pruning, heartbeat/touch helpers | `redis.service.ts`, specs | 2A |
| B2 | Add socket ownership guard and stale-socket rejection | `office.gateway.ts` | 2A |
| B3 | Add `presence:heartbeat` handler and refresh TTL from movement/media events | `office.gateway.ts` | 2A |
| B4 | Add avatar DTO validation and default avatar config | auth/user DTOs/services | 2B |
| B5 | Add users module with `GET /users`, `GET /users/me`, `PATCH /users/me/avatar` | new users module | 2B |
| B6 | Include `avatarConfig` in auth responses and realtime `PlayerState` | auth + realtime contracts | 2B |
| B7 | Add office isometric metadata and desk anchor fields | `office.entity.ts`, `zone.entity.ts` | 2C |
| B8 | Replace seeded top-down layout with neutral isometric office layout | `office.service.ts` | 2C |
| B9 | Return desk assignment details in office/zone snapshots | office service + gateway mapping | 2C |
| B10 | Add desk assignment service logic with self-service and admin override rules | office service | 2D |
| B11 | Add `desk:assign`, `desk:unassign`, `desk:go-to-mine`, `desk:updated` realtime events | `office.gateway.ts` | 2D |
| B12 | Add backend unit/realtime tests for presence, avatars, desks, seed layout | specs | 2I |
| B13 | Build and test backend | all | 2I |

### Frontend Tasks

| # | Task | Files | Phase |
|---|------|-------|-------|
| F1 | Expand shared types for avatar, office layout, desk fields, presence/desk events | `types.ts` | 2E |
| F2 | Update auth store for avatar persistence and avatar update | `auth.store.ts` | 2E |
| F3 | Update game store for layout metadata, desk selection, desk updates, reconnect state | `game.store.ts` | 2E |
| F4 | Add typed socket support for heartbeat, desk events, reconnect/resync | `socket.service.ts`, network layer | 2E |
| F5 | Add avatar preset catalog and reusable avatar picker | new avatar UI files | 2F |
| F6 | Add avatar selection to registration and invite acceptance | auth screens/forms | 2F |
| F7 | Add HUD profile button and profile/avatar sidebar | HUD/UI components | 2F |
| F8 | Add isometric projection utilities and tests | spatial utils | 2G |
| F9 | Refactor Phaser office scene to isometric floor/zone rendering | `OfficeScene.ts` | 2G |
| F10 | Refactor player rendering/depth sorting for isometric coordinates | `PlayerSprite.ts`, `PlayerManager.ts` | 2G |
| F11 | Refactor input movement to logical isometric grid coordinates | `InputManager.ts` | 2G |
| F12 | Update minimap to projected isometric layout | `Minimap.tsx` | 2G |
| F13 | Add desk hover/click selection and highlighting | Phaser scene/store | 2H |
| F14 | Add desk panel actions and “Go to my desk” button | HUD/sidebar components | 2H |
| F15 | Add guided movement to assigned desk anchor | movement/network systems | 2H |
| F16 | Build, lint, and manually verify frontend | all | 2I |

## Verification Plan

### Automated Tests

```powershell
# Backend
cd D:\Echofox\project-aura
npm test
npm run build

# Frontend
cd D:\Echofox\project-aura-fe
npm run build
npm run lint
```

### Backend Test Scenarios

1. `office:state` excludes expired Redis presence records.
2. Heartbeat refreshes player TTL.
3. Disconnect only removes presence when `socketId` matches active presence.
4. Duplicate login replaces old socket without letting old disconnect remove new presence.
5. Stale socket movement/media/desk events are rejected or ignored.
6. Register company and invite accept persist valid avatar config.
7. Login returns avatar config.
8. `PATCH /users/me/avatar` validates and persists avatar changes.
9. Default office seed creates isometric metadata and neutral desks.
10. Desk assignment enforces one desk per user per office.
11. Employee can claim/release own desk.
12. ORG_ADMIN can override or clear assignments.
13. `desk:updated` broadcasts updated desk snapshot.
14. `desk:go-to-mine` rejects users without assigned desks and returns anchor for assigned users.

### Frontend Test Scenarios

1. Avatar picker submits selected preset during registration.
2. Invite acceptance submits selected avatar.
3. Auth store persists updated avatar config.
4. Game store replaces stale player snapshot on office resync.
5. Desk assignment updates mutate only the target desk zone.
6. Isometric `worldToScreen` and `screenToWorld` utilities are consistent enough for input.
7. Player depth increases correctly by grid position.
8. Minimap renders projected zones and players.
9. Desk panel shows correct actions for unassigned, own desk, assigned desk, and admin override.

### Manual Verification

1. Start backend API, realtime gateway, Redis, Postgres, and frontend.
2. Open two users in the same office and verify online count is correct.
3. Kill one browser tab abruptly and verify the user disappears after TTL expiry.
4. Log in as the same user twice and verify the older socket cannot remove the newer session.
5. Register or accept invite with an avatar and verify it appears in the office.
6. Change avatar in the profile sidebar and verify it persists after relogin.
7. Verify office renders as isometric diamond tiles, not top-down rectangles.
8. Claim an unassigned desk from one client and verify all clients see the update.
9. Release the desk and verify it becomes available.
10. Use admin override to assign or clear another user’s desk.
11. Click “Go to my desk” and verify the avatar walks to the desk anchor.
12. Confirm proximity/meeting/SFU behavior still works after isometric movement changes.

## Coordinated Deployment

> [!WARNING]
> Phases 2A–2D (backend) and 2E–2H (frontend) must be deployed together. The isometric coordinate system change is a **breaking spatial contract** — deploying one side without the other will cause players to appear at wrong positions, zone detection to fail, and desk anchors to be misaligned.

Recommended rollout order:
1. Deploy backend phases 2A–2D together (one backend release).
2. Deploy frontend phases 2E–2H together (one frontend release).
3. **Flush Redis** `office:*` keys before the first coordinated startup so stale top-down player data doesn't pollute the new isometric system.

## Assumptions

- Backend repo remains `D:\Echofox\project-aura`; frontend repo remains `D:\Echofox\project-aura-fe`.
- Preset avatar v1 uses stored config IDs, not uploaded images.
- Isometric v1 uses placeholder Phaser diamond/polygon drawing, not final art assets.
- Self-service desk claiming is enabled for employees; admins can override.
- `synchronize: true` remains acceptable for local development, but production migration files should be added before deployment.
- Presence TTL default: 30 seconds. Heartbeat interval: 15 seconds. These values should be configurable via env vars.
- Frontend heartbeat piggybacks on `player:move` where possible; standalone heartbeat only needed for idle users.
