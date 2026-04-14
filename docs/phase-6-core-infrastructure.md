# Phase 6: Core Infrastructure

## Summary

Phase 6 adds the shared frontend foundation for Project Aura without changing the UI yet. The app still renders the placeholder `App.tsx`, but the renderer now has typed contracts, env-backed backend URLs, a REST client, a typed Socket.IO service, and the three Zustand stores that later phases will build on.

## What Changed

- Added `socket.io-client` as the only new runtime dependency for realtime integration.
- Added shared contract definitions in `src/core/types.ts` for:
  - Auth requests and responses
  - Office, zone, and player models
  - Socket payloads for both client-to-server and server-to-client events
- Added `src/core/config.ts` plus `src/vite-env.d.ts` and `.env.example` for:
  - `VITE_AURA_API_URL`
  - `VITE_AURA_REALTIME_URL`
  - Default fallbacks to `http://localhost:3000` and `http://localhost:3001`
- Added `src/core/api/api.client.ts`:
  - `get`, `post`, and `setToken`
  - typed `ApiError` handling for Nest-style error payloads
- Added `src/core/services/socket.service.ts`:
  - lazy socket creation
  - typed `emit`, `on`, `off`
  - `connect`, `disconnect`, `isConnected`
  - convenience lifecycle hooks for connect, disconnect, and connect errors
- Added `src/core/store/auth.store.ts`:
  - `login`, `logout`, and `hydrate`
  - manual persistence using `aura_token` and `aura_user`
  - cleanup across API, socket, game, and media layers on logout
- Added `src/core/store/game.store.ts`:
  - office metadata
  - normalized players map
  - current zone state
  - meeting membership state
  - idempotent participant updates
- Added `src/core/store/media.store.ts`:
  - local media lifecycle
  - mic and camera toggles
  - remote stream registration and cleanup
  - idempotent remote stream replacement
- Cleaned up `electron/main.ts` to remove the unused `require` shim that was blocking lint.

## Environment

Optional frontend env overrides:

```bash
VITE_AURA_API_URL=http://localhost:3000
VITE_AURA_REALTIME_URL=http://localhost:3001
```

If those values are omitted, the frontend still defaults to the localhost ports used by the backend POC.

## Validation Commands

Use `npm.cmd` in PowerShell if `npm.ps1` is blocked by execution policy.

```powershell
npm.cmd run lint
node .\node_modules\typescript\bin\tsc -b
npm.cmd run build
```

Notes:

- `lint` should pass after the Electron cleanup.
- `tsc -b` is the main typecheck used for this phase.
- In this sandbox, `npm.cmd run build` may fail during Vite config bundling with `spawn EPERM`. That is an environment limitation, not a known phase 6 code issue. Re-run it in a normal local shell to confirm the final build.

## Manual Smoke Testing

These checks assume:

- the backend repo at `D:\Echofox\project-aura` is running
- API is available on port `3000`
- realtime gateway is available on port `3001`
- the frontend is running with `npm.cmd run dev`

### 1. Auth Store and API Client

Open browser devtools on the Vite app and run:

```js
const { useAuthStore, AUTH_STORAGE_KEYS } = await import('/src/core/store/auth.store.ts');
await useAuthStore.getState().login('admin@example.com', 'your-password');
useAuthStore.getState();
localStorage.getItem(AUTH_STORAGE_KEYS.token);
localStorage.getItem(AUTH_STORAGE_KEYS.user);
```

Expected result:

- valid credentials set `token`, `user`, and `isAuthenticated: true`
- invalid credentials leave `isAuthenticated: false` and populate `error`

### 2. Hydration

After a successful login:

```js
useAuthStore.getState().hydrate();
useAuthStore.getState();
```

Expected result:

- the store restores the token and user from `localStorage`
- malformed values in `aura_token` or `aura_user` are cleared automatically

### 3. Socket Service

```js
const { socketService } = await import('/src/core/services/socket.service.ts');
const token = useAuthStore.getState().token;
await socketService.connect(token);
socketService.isConnected();
```

Expected result:

- valid token connects successfully and returns `true` from `isConnected()`
- invalid token rejects `connect()` with a websocket auth error

### 4. Office Join Contract

```js
socketService.on('office:state', (payload) => console.log('office:state', payload));
socketService.emit('office:join', { officeId: 'YOUR_OFFICE_UUID' });
```

Expected result:

- the server emits `office:state`
- payload contains `players` and `zones`

### 5. Game Store

```js
const { useGameStore } = await import('/src/core/store/game.store.ts');
useGameStore.getState().setLocalPlayerId('user-1');
useGameStore.getState().enterMeeting('zone-1', ['user-2', 'user-2']);
useGameStore.getState().addMeetingParticipant('user-3');
useGameStore.getState().addMeetingParticipant('user-3');
useGameStore.getState();
```

Expected result:

- duplicate meeting participants are deduplicated
- state updates stay normalized and deterministic

### 6. Media Store

```js
const { useMediaStore } = await import('/src/core/store/media.store.ts');
await useMediaStore.getState().initMedia();
useMediaStore.getState().toggleMic();
useMediaStore.getState().toggleCamera();
useMediaStore.getState().stopMedia();
useMediaStore.getState();
```

Expected result:

- browser prompts for camera/mic access
- local stream initializes
- toggles update the enabled state of the active media tracks
- `stopMedia()` clears the local stream state

### 7. Logout Cleanup

```js
useAuthStore.getState().logout();
useAuthStore.getState();
```

Expected result:

- auth storage keys are removed
- API token is cleared
- socket is disconnected
- game state resets
- local and remote media streams are cleaned up

## Known Boundaries

- This phase does not add login screens, office selection, Phaser rendering, WebRTC manager logic, or routing.
- `hydrate()` exists but is not wired into `App.tsx` yet. That hookup belongs to Phase 7.
- The frontend contract layer intentionally includes live backend events that are already emitted today, even where the original frontend phase doc was narrower.
