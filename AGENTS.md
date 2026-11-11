# Project Aura — Frontend

Guide for coding agents. Start here, then read the `AGENTS.md` in the folder you are changing.

## What this is

The client for Aura, a multi-tenant virtual office. Users sign in, pick an office, and walk an avatar around a 2D
**isometric** office. Media is proximity-based (mediasoup SFU), meeting zones act as rooms, desks can be owned, and admins
can edit furniture live. It runs in the browser and as an Electron desktop app.

- Frontend (this repo): `EchofoxdesignLabs/project_Aura_FE`.
- Backend: `EchofoxdesignLabs/Project_Aura` (local: `D:\Echofox\Project_Aura`). It has a REST API on `:3000` and Socket.IO plus the SFU on `:3001`.
  The backend `AGENTS.md` files describe every endpoint and event.

## Stack

React 19, Vite 7, TypeScript 5.9 (strict), Phaser 3.90, Zustand 5, Tailwind 4, socket.io-client 4, mediasoup-client 3,
Electron 39, and lucide-react icons.

## Commands

```bash
npm install
npm run dev            # Vite on http://localhost:51173 (strictPort)
npm run lint           # ESLint (must pass)
npm run build          # tsc -b && vite build (must pass)
npm run electron:dev   # Electron + Vite (see electron/AGENTS.md: port mismatch)
```

There is **no test runner** yet. The definition of done is that `npm run lint` and `npm run build` are clean, plus a manual run against the backend.

Env (`.env`, see `.env.example`): `VITE_AURA_API_URL` (default `http://localhost:3000`) and `VITE_AURA_REALTIME_URL`
(default `http://localhost:3001`). They are read in `src/core/config.ts` only.

## Layout

| Path | What | Guide |
|------|------|-------|
| `src/App.tsx` | Screen state machine (no router). | below |
| `src/core` | API client, socket service, SFU manager, Zustand stores, shared types, UI primitives. | [src/core/AGENTS.md](src/core/AGENTS.md) |
| `src/modules/auth` | Login, register company, accept invite. | [src/modules/auth/AGENTS.md](src/modules/auth/AGENTS.md) |
| `src/modules/office` | Office picker, invite modal, office seeding. | [src/modules/office/AGENTS.md](src/modules/office/AGENTS.md) |
| `src/modules/spatial` | Phaser world, isometric math, movement, presence, proximity and meetings, HUD overlays. | [src/modules/spatial/AGENTS.md](src/modules/spatial/AGENTS.md) |
| `src/modules/builder` | Runtime office builder (furniture catalog, placement, undo/redo, sync). | [src/modules/builder/AGENTS.md](src/modules/builder/AGENTS.md) |
| `electron/` | Desktop shell. | [electron/AGENTS.md](electron/AGENTS.md) |
| `public/assets/furniture` | Future furniture art (`atlases/`, `individual/`). Placeholders are generated in code for now. | `docs/asset-creation-guide.md` |
| `docs/`, `implementation_plan.md` | Phase plans and the 6-week investor-prototype plan. Historical, so verify against the code. | — |

## App flow (`src/App.tsx`)

1. A path starting with `/invite/` shows `InviteAcceptScreen`.
2. Not authenticated: `LoginScreen`.
3. No `currentOfficeId` in the game store: `OfficeSelectScreen`. This connects the socket and emits `office:join`.
4. Otherwise: `GameContainer`, which boots Phaser, the SFU, media and the HUD.

Auth is restored from `localStorage` (`aura_token`, `aura_user`) by `useAuthStore.hydrate()`.

## Architecture rules

1. **React renders screens and overlays. Phaser renders the world.** They communicate only through Zustand stores:
   React uses hooks, while Phaser and the systems use `useXStore.getState()` and `subscribe`. Do not pass React props into Phaser.
2. **All server I/O goes through `src/core`.** Use `apiClient` for REST and `socketService` for sockets, and never call `fetch` or `io` directly.
   Add new socket events to the typed maps in `src/core/types.ts` (`SocketClientToServerEvents`,
   `SocketServerToClientEvents`, and `SocketRequestEvents` for acks).
3. **The server is authoritative** for presence, zones, meetings, desks and media routing. The client predicts only its own movement.
4. **Coordinates:** network and store positions are **grid (tile) units**. Convert to screen pixels only in Phaser, through
   `src/modules/spatial/utils/isometric.ts` (`gridToScreen` and `screenToGrid`).
5. **Contract changes** must match the backend `apps/aura-realtime/src/contracts/realtime.types.ts` and the REST DTOs.

## Conventions

- Path aliases: `@core/*` and `@spatial/*` are in use. `@app`, `@enterprise`, `@productivity`, `@intelligence` and `@assets` are
  declared in `vite.config.ts` and `tsconfig.app.json`, but their folders do not exist yet, so create the folder before using one.
  Cross-module imports currently use relative paths, for example from spatial into builder.
- Feature module layout: `ui/screens`, `ui/components`, `systems`, `scenes`, `entities`, `state`, `utils`, `catalog`.
- Styling: Tailwind utility classes, combined with `cn()` from `@core/utils/cn`. Primitives live in `src/core/ui`.
- `verbatimModuleSyntax` is on, so use `import type` for type-only imports.
- Singletons: `socketService`, `apiClient`, `sfuManager`, `meetingSystem` and `proximitySystem` are module-level instances.

## Git flow

Work happens on feature branches named `feat*` and goes through PRs to `dev`, then `staging`, then `main`. `origin/main` is far behind, so work lives on the feature branches.
Build output (`dist`, `dist-electron`, `*.tsbuildinfo`) is git-ignored. Do not commit it.

## Known gaps (as of 2026-10)

- No automated tests.
- The JWT is stored in `localStorage` with a 1-day expiry, and there is no refresh or expiry check on hydrate. An expired token fails only at the socket handshake.
- The invite route depends on `window.location.pathname`, which does not work in the packaged Electron app (`file://`).
- Lots of `console.log` in the hot paths (socket requests, SFU, office state).
- The main bundle is over 500 kB (Phaser). Lazy-load `GameContainer`.
