# Phase 2: Video & Screen Share — Implementation Plan

## Goal

Extend the working Phase 1 audio-only SFU to support **camera video** and **screen sharing** through the same Mediasoup transport infrastructure. All media remains SFU-routed — no P2P fallback.

## Scope

### ✅ Implementing Now (2A–2G + 2K)

| Phase | Description |
|-------|-------------|
| **2A** | Backend media model refactor — tagged `producers` Map, VP8 codec |
| **2B** | Backend signaling extensions — `sfu:close-producer`, `sfu:pause-producer`, `sfu:resume-producer` |
| **2C** | Spatial routing for all media tags — reconciliation iterates every producer |
| **2D** | Office gateway integration — disconnect handles multiple producers |
| **2E** | Frontend `SFUManager` producer refactor — tagged producer/consumer maps |
| **2F** | Frontend UI refactor — `VideoTile`, `MeetingOverlay`, `ProximityIndicator`, `MediaToolbar` |
| **2G** | Active speaker / audio-level UI — client-side speaking detection |
| **2K** | Tests and verification |

### 🔲 Deferred (Implement After Core Media Works)

| Phase | Description | Why Deferred |
|-------|-------------|------|
| **2H** | Admin/debug endpoint (`sfu:get-office-debug-state`) | Operational tooling, not needed for core media |
| **2I** | Multi-instance SFU ownership (Redis-backed sticky routing) | Single-node is sufficient for current deployment |
| **2J** | Production observability (`prom-client` metrics, `/metrics` endpoint) | Monitoring layer, add after media is stable |

## Current State

Phase 1 is complete and working:
- Backend: `MediasoupService` manages one `micProducer` per `SfuPeer`, `SpatialAudioService` reconciles audio consumers based on proximity/meeting zones, `SfuGateway` handles audio-only `sfu:produce`
- Frontend: `SFUManager` produces mic audio, consumes remote mic streams, `ProximitySystem` adjusts volume, `MeetingSystem` sets meeting volumes, media store tracks `remoteStreams: Record<string, MediaStream>` (single stream per user)

## User Review Required

> [!WARNING]
> **Breaking frontend change**: `remoteStreams: Record<string, MediaStream>` will be replaced with `remoteMedia: Record<string, RemoteUserMedia>` (tagged by `mic`/`camera`/`screen`). All UI components reading `remoteStreams` must be updated simultaneously.

## Proposed Changes

### Backend Changes (`D:\Echofox\project-aura`)

---

#### Phase 2A: Backend Media Model Refactor

##### [MODIFY] [sfu.types.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/sfu.types.ts)

- Expand `SfuMediaTag` from `'mic'` to `'mic' | 'camera' | 'screen'`
- Replace `micProducer?: Producer` with `producers: Map<SfuMediaTag, Producer>` in `SfuPeer`
- Add `SfuProducerAppData` and `SfuConsumerAppData` interfaces
- Add `SfuMediaTagKindMap` to enforce kind/tag pairing

##### [MODIFY] [sfu.constants.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/sfu.constants.ts)

- Add VP8 video codec to `SFU_MEDIA_CODECS`
- Add `SFU_MEDIA_TAG_CAMERA` and `SFU_MEDIA_TAG_SCREEN` constants
- Add `SFU_VALID_MEDIA_TAG_KINDS` mapping for validation

##### [MODIFY] [mediasoup.service.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/mediasoup.service.ts)

- Replace all `micProducer` references with `producers` Map lookups
- Refactor `produceMic()` → `produce(officeId, userId, transportId, kind, rtpParameters, mediaTag)` generic producer method
- Refactor `createConsumer()` to iterate all producers for a peer (not just mic)
- Update `closeConsumersForProducer()` to include `mediaTag` in close payload
- Update `removePeer()` to close all tagged producers
- Update `closeRoom()` to close all tagged producers
- Add `getProducer(officeId, userId, mediaTag)` helper
- Add `closeProducer(officeId, userId, mediaTag)` to close a specific tagged producer
- Add `pauseProducer(officeId, userId, mediaTag)` and `resumeProducer(officeId, userId, mediaTag)`

---

#### Phase 2B: Backend Signaling Contract Extensions

##### [MODIFY] [produce.dto.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/dto/produce.dto.ts)

- Change `@IsIn(['audio'])` to `@IsIn(['audio', 'video'])`
- Change `appData.mediaTag` from `'mic'` to `'mic' | 'camera' | 'screen'`
- Make `appData` required (not optional)

##### [NEW] [close-producer.dto.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/dto/close-producer.dto.ts)

- Fields: `producerId?: string`, `mediaTag?: SfuMediaTag`

##### [NEW] [pause-producer.dto.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/dto/pause-producer.dto.ts)

- Field: `mediaTag: SfuMediaTag`

##### [NEW] [resume-producer.dto.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/dto/resume-producer.dto.ts)

- Field: `mediaTag: SfuMediaTag`

##### [MODIFY] [sfu.gateway.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/sfu.gateway.ts)

- Remove Phase 1 `kind !== 'audio'` guard from `handleProduce`
- Add kind/mediaTag validation: `mic` must be `audio`, `camera`/`screen` must be `video`
- Add `sfu:close-producer` handler
- Add `sfu:pause-producer` handler
- Add `sfu:resume-producer` handler
- Emit `screenshare:start` when a `screen` producer is created
- Emit `screenshare:stop` when a `screen` producer is closed

---

#### Phase 2C: Spatial Routing for All Media Tags

##### [MODIFY] [spatial-audio.service.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/sfu/spatial-audio.service.ts)

- Rename `shouldReceiveAudio` → `shouldReceiveProducer` (same logic, works for all tags)
- Update `reconcileOffice()`: instead of checking only `micProducer`, iterate `producerPeer.producers` (all tags)
- Include `mediaTag` in `sfu:consumer-closed` payloads
- Emit `screenshare:stop` when a screen producer closes due to transport/disconnect

---

#### Phase 2D: Office Gateway Integration

##### [MODIFY] [office.gateway.ts](file:///d:/Echofox/project-aura/apps/aura-realtime/src/gateways/office.gateway.ts)

- Update `handleDisconnect` to close all tagged producers before `screenshare:stop` check
- The existing `screenshare:start`/`screenshare:stop` socket handlers remain for the broadcast, but screen-share lifecycle is now also driven by `sfu:produce`/`sfu:close-producer`

---

### Frontend Changes (`D:\Echofox\project-aura-fe`)

---

#### Phase 2D-FE: Media Store Refactor

##### [MODIFY] [types.ts](file:///D:/Echofox/project-aura-fe/src/core/types.ts)

- Expand `SfuMediaTag` from `'mic'` to `'mic' | 'camera' | 'screen'`
- Expand `SfuNewConsumerPayload.kind` from `'audio'` to `'audio' | 'video'`
- Expand `SfuProduceRequest.kind` from `'audio'` to `'audio' | 'video'`
- Add `SfuCloseProducerRequest`, `SfuPauseProducerRequest`, `SfuResumeProducerRequest`
- Add `RemoteUserMedia` interface: `{ mic?: MediaStream; camera?: MediaStream; screen?: MediaStream }`
- Add new socket request events: `sfu:close-producer`, `sfu:pause-producer`, `sfu:resume-producer`

##### [MODIFY] [media.store.ts](file:///D:/Echofox/project-aura-fe/src/core/store/media.store.ts)

- Replace `remoteStreams: Record<string, MediaStream>` with `remoteMedia: Record<string, RemoteUserMedia>`
- Keep `remoteStreams` as a computed getter for backward compat during migration (returns `mic` streams)
- Add `setRemoteMediaStream(userId, mediaTag, stream)`
- Add `removeRemoteMediaStream(userId, mediaTag)`
- Add `removeAllRemoteMediaForUser(userId)`
- Add `clearAllRemoteMedia()`
- Restore `initMedia()` to request `{ audio: true, video: true }` (graceful fallback if camera denied)
- Restore `toggleCamera()` to close/recreate camera producer through SFU
- Restore `startScreenShare()` to produce screen track through SFU
- Restore `stopScreenShare()` to close screen producer through SFU

##### [MODIFY] [socket.service.ts](file:///D:/Echofox/project-aura-fe/src/core/services/socket.service.ts)

- No structural changes needed — just the new `SocketRequestEvents` entries from `types.ts`

---

#### Phase 2E: SFUManager Producer Refactor

##### [MODIFY] [sfu.manager.ts](file:///D:/Echofox/project-aura-fe/src/core/services/sfu/sfu.manager.ts)

- Replace `micProducer` with `producersByTag: Map<SfuMediaTag, Producer>`
- Replace `consumerIdsByRemoteUser` with `consumersByUserAndTag: Map<string, Consumer>` (key = `userId:mediaTag`)
- Remove Phase 1 audio-only guards from `handleNewConsumer` and send transport `produce` callback
- Add `startCameraProducer(track)`, `stopCameraProducer()`
- Add `startScreenShareProducer(track)`, `stopScreenShareProducer()`
- Add `closeProducer(mediaTag)` — calls `sfu:close-producer`
- Add `pauseMicProducer()` and `resumeMicProducer()` — calls `sfu:pause-producer`/`sfu:resume-producer`
- Update `handleNewConsumer()`: route by `mediaTag` to correct store field (mic → audio playback, camera → store, screen → store + addScreenSharingUser)
- Update `handleConsumerClosed()`: clean only the matching `mediaTag` stream
- Add camera simulcast encodings for `camera` producers
- Add screen track `ended` event listener to auto-stop screen share

---

#### Phase 2F: UI Components Refactor

##### [MODIFY] [VideoTile.tsx](file:///D:/Echofox/project-aura-fe/src/modules/spatial/ui/components/VideoTile.tsx)

- Add optional `audioStream` prop for speaking detection (separate from video `stream`)
- Use `audioStream` (or fall back to `stream`) for audio level analysis
- `videoStream` (the main `stream` prop) drives `<video>` element

##### [MODIFY] [MeetingOverlay.tsx](file:///D:/Echofox/project-aura-fe/src/modules/spatial/ui/MeetingOverlay.tsx)

- Read from `remoteMedia[userId].camera` for video tiles
- Read from `remoteMedia[userId].mic` for speaking detection
- Read from `remoteMedia[userId].screen` for screen-share featured tile
- Restore camera toggle button
- Restore screen-share toggle button
- Show featured screen-share tile when any participant is sharing

##### [MODIFY] [ProximityIndicator.tsx](file:///D:/Echofox/project-aura-fe/src/modules/spatial/ui/ProximityIndicator.tsx)

- Read from `remoteMedia` instead of `remoteStreams`
- Show video when `remoteMedia[userId].camera` exists
- Show speaking ring when only `remoteMedia[userId].mic` exists

##### [MODIFY] [MediaToolbar.tsx](file:///D:/Echofox/project-aura-fe/src/modules/spatial/ui/components/MediaToolbar.tsx)

- Add camera toggle button
- Add screen-share toggle button
- Wire to `toggleCamera()` and `startScreenShare()`/`stopScreenShare()`

##### [MODIFY] [GameContainer.tsx](file:///D:/Echofox/project-aura-fe/src/modules/spatial/ui/GameContainer.tsx)

- Update `initMedia()` call to handle partial permissions (mic only, camera only, both, neither)
- Start camera producer if camera track available after init

---

## Step-by-Step Task Breakdown

### Backend Tasks

| # | Task | Files | Phase |
|---|------|-------|-------|
| B1 | Expand `SfuMediaTag` type and refactor `SfuPeer` to use `producers: Map<SfuMediaTag, Producer>` | `sfu.types.ts` | 2A |
| B2 | Add VP8 video codec and new media tag constants | `sfu.constants.ts` | 2A |
| B3 | Refactor `MediasoupService` from `micProducer` to tagged `producers` Map. Add `produce()`, `closeProducer()`, `pauseProducer()`, `resumeProducer()` | `mediasoup.service.ts` | 2A |
| B4 | Update `ProduceDto` to accept `audio \| video` kinds and `mic \| camera \| screen` tags | `produce.dto.ts` | 2B |
| B5 | Create `CloseProducerDto`, `PauseProducerDto`, `ResumeProducerDto` | new DTOs | 2B |
| B6 | Update `SfuGateway`: remove Phase 1 audio guard, add kind/tag validation, add `sfu:close-producer`, `sfu:pause-producer`, `sfu:resume-producer` handlers, emit `screenshare:start/stop` | `sfu.gateway.ts` | 2B |
| B7 | Update `SpatialAudioService`: rename `shouldReceiveAudio` → `shouldReceiveProducer`, iterate all producers in reconciliation loop | `spatial-audio.service.ts` | 2C |
| B8 | Update `OfficeGateway.handleDisconnect` to account for multiple tagged producers | `office.gateway.ts` | 2D |
| B9 | Build and test backend | all | 2K |

### Frontend Tasks

| # | Task | Files | Phase |
|---|------|-------|-------|
| F1 | Expand SFU types: `SfuMediaTag`, `RemoteUserMedia`, new request interfaces | `types.ts` | 2D-FE |
| F2 | Refactor `media.store.ts`: replace `remoteStreams` with `remoteMedia`, restore `toggleCamera()` and `startScreenShare()`, request audio+video on init | `media.store.ts` | 2D-FE |
| F3 | Refactor `SFUManager`: tagged producer map, multi-tag consumer handling, add camera/screen producer methods | `sfu.manager.ts` | 2E |
| F4 | Update `VideoTile`: add `audioStream` prop for split audio/video analysis | `VideoTile.tsx` | 2F |
| F5 | Update `MeetingOverlay`: use `remoteMedia`, restore camera/screen-share buttons, featured screen tile | `MeetingOverlay.tsx` | 2F |
| F6 | Update `ProximityIndicator`: use `remoteMedia` for video/speaking detection | `ProximityIndicator.tsx` | 2F |
| F7 | Update `MediaToolbar`: add camera and screen-share buttons | `MediaToolbar.tsx` | 2F |
| F8 | Update `GameContainer`: handle partial permissions, start camera producer | `GameContainer.tsx` | 2F |
| F9 | Build and lint frontend | all | 2K |

## Verification Plan

### Automated Tests

```powershell
# Backend
cd D:\Echofox\project-aura
cmd /c npx nest build aura-realtime

# Frontend
cd D:\Echofox\project-aura-fe
npm run build
npm run lint
```

### Manual Verification (After Both Backend + Frontend Are Complete)

1. Two users within 300 px can hear each other and see camera video
2. Camera off removes remote video but keeps remote mic
3. Camera on recreates the camera producer and remote camera tile returns
4. Screen share start creates a featured screen tile for eligible receivers
5. Screen share stop removes only the screen tile, mic/camera remain
6. Browser native "Stop sharing" performs same cleanup as app button
7. Same meeting zone receives mic, camera, and screen regardless of distance
8. Leaving a meeting closes meeting-only consumers unless within open-office proximity
9. Refreshing a tab closes all tagged producers and consumers cleanly
