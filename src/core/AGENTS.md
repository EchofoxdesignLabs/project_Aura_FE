# src/core — infrastructure shared by all modules

Feature modules depend on `core`, and `core` must not import from `src/modules/*` (it currently doesn't, so keep it that way).
Module-owned stores, such as `builder.store`, live inside their module.

## Files

| File | Role |
|------|------|
| `config.ts` | `AURA_API_URL` and `AURA_REALTIME_URL` from `VITE_*` env vars, with localhost defaults. |
| `api/api.client.ts` | `apiClient` (`get`, `post`, `patch`, `delete`) adds the Bearer token, parses JSON, and throws `ApiError(status, message, payload)` using Nest's `message` (string or string[]). **There is no `put` method yet**, so add one if you need `PUT /office/:id/furniture`. |
| `services/socket.service.ts` | `socketService` is a typed wrapper around a single Socket.IO connection (websocket transport only). `connect(token)` resolves on connect. `emit` is fire-and-forget. `request(event, payload, timeoutMs)` uses acks for events in `SocketRequestEvents`. `on`, `off`, `onConnect`, `onDisconnect` and `onError` are also provided. |
| `services/sfu/sfu.manager.ts` | `sfuManager` owns the mediasoup-client `Device`, the send and recv transports, producers (`mic`, `camera`, `screen`) and consumers. It handles `sfu:new-consumer` and `sfu:consumer-closed`, and pushes remote streams into the media store. |
| `services/sfu/sfu-audio-handler.ts` | Creates one `<audio>` element per remote user. `setAudioVolume` is driven by the proximity and meeting systems. |
| `store/auth.store.ts` | Token and user, login, register (which auto-logs in), invites, avatar update (REST and then socket broadcast), logout (disconnects the socket and resets the game and media stores), and hydrate from `localStorage`. |
| `store/game.store.ts` | Office metadata, zones, `players` keyed by userId, local player id, current zone, meeting state, desk selection and hover, navigation target, and connection status. Uses `subscribeWithSelector` so Phaser can subscribe. |
| `store/media.store.ts` | Local mic and camera stream, toggles (which emit `media:state`), screen share, remote media per user and tag, and peer mic and camera flags. |
| `types.ts` | **The contract file**: REST request and response types, `PlayerState`, zone and office types, every socket payload, and the typed event maps. It mirrors the backend `realtime.types.ts`. |
| `ui/` | `Button`, `Card` and `Input` primitives. Tailwind and `forwardRef`. |
| `utils/cn.ts` | `clsx` plus `tailwind-merge`. |

## Rules

- When you add a socket event, add it to the right map in `types.ts` first. `socketService` will then type-check both the payload and
  the handler. Put events that the server acknowledges in `SocketRequestEvents` and call them with `socketService.request`.
- `socketService.on` throws if the socket is not connected yet. Register listeners after `connect()`, which is what
  `NetworkManager.init()` does, and always `off` them on teardown.
- Store actions should stay synchronous and side-effect light. Network side effects live in services or systems. Existing
  exceptions: `auth.store` (REST calls) and `media.store` (`getUserMedia` and SFU calls).
- Session state must not leak between users. `logout()` resets the game and media stores. Module stores reset on their own
  teardown (the builder store resets when `GameContainer` unmounts). If you add a store, decide which of the two it belongs to.
- The avatar default (`aura-01` / `ocean`) is duplicated from the backend `@app/common`, so keep the two in sync.
