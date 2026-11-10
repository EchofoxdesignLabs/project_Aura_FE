# Phase 10 — WebRTC Media Layer

## Overview

Phase 10 adds real-time voice and video communication to the virtual office using native browser WebRTC APIs. Users can hear and see each other based on spatial proximity in the open office, and switch to full-room conferencing when inside a meeting zone.

### Architecture Summary

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ GameContainer │─────▸│  ProximitySystem  │─────▸│  WebRTCManager   │
│  (React)      │      │  (500ms interval) │      │  (Peer Lifecycle)│
└──────────────┘      └──────────────────┘      └──────────────────┘
       │                                               │
       │              ┌──────────────────┐             │
       └─────────────▸│  MeetingSystem   │─────────────┘
                      │  (Store watcher) │
                      └──────────────────┘
                              │
                      ┌──────────────────┐
                      │  NetworkManager  │
                      │  (Signaling bus) │
                      └──────────────────┘
```

**No third-party services** — all media is peer-to-peer via `RTCPeerConnection`, with the backend only relaying SDP offers/answers and ICE candidates through Socket.IO.

---

## Components

### WebRTCManager (`src/core/services/webrtc.manager.ts`)

Central singleton that owns all `RTCPeerConnection` instances and manages the full media/signaling lifecycle.

#### Responsibilities

| Area | Details |
|------|---------|
| **Local stream** | Stores the local `MediaStream` from `getUserMedia`. Retroactively adds tracks to any peers created before the stream was available. |
| **Peer connections** | Creates, manages, and tears down `RTCPeerConnection` instances per remote user. |
| **Signaling** | Creates SDP offers/answers, handles inbound signaling, exchanges ICE candidates via Socket.IO. |
| **Audio playback** | Plays remote audio via `<audio>` elements with `srcObject`. Controls per-peer volume via `audioElement.volume`. |
| **ICE buffering** | Buffers ICE candidates that arrive before `setRemoteDescription` and flushes them after. |
| **Glare handling** | Uses deterministic tie-breaking (lower user ID defers) and SDP rollback for edge cases. |

#### Public API

```typescript
setLocalStream(stream: MediaStream | null): void
connectToPeer(targetUserId: string): Promise<void>
handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void>
handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void>
handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void>
setAudioVolume(userId: string, volume: number): void
disconnectPeer(userId: string): void
disconnectAll(): void
```

#### ICE Configuration

The POC uses Google's public STUN server for NAT traversal:

```typescript
const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
```

#### Audio Playback Strategy

Remote audio is played via `HTMLAudioElement` rather than the Web Audio API. Chrome has a known issue where `createMediaStreamSource()` from remote WebRTC streams doesn't produce audible output through the `AudioContext` pipeline. The `<audio>` element approach is simpler and works reliably across all browsers.

```
Remote MediaStream → <audio srcObject={stream} autoplay> → speakers
Volume control    → audioElement.volume = 0..1
```

#### Glare Prevention

WebRTC "glare" occurs when both peers simultaneously create offers. This implementation uses a **deterministic tie-breaker**: only the user with the **higher** user ID creates the offer. The lower-ID user defers and waits to receive the offer via `handleOffer`.

```typescript
// In connectToPeer:
if (localUserId && localUserId < targetUserId) return; // Defer to higher ID
```

If glare still occurs (edge case), `handleOffer` performs an SDP rollback:

```typescript
if (peer.signalingState === 'have-local-offer') {
  await peer.setLocalDescription({ type: 'rollback' });
}
```

---

### ProximitySystem (`src/modules/spatial/systems/ProximitySystem.ts`)

Runs a 500ms interval that reads player positions from `gameStore` and connects/disconnects peers based on distance.

#### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `PROXIMITY_RADIUS` | 300 | Maximum distance (px) for audio/video connection |
| `FULL_VOLUME_RADIUS` | 50 | Distance (px) at which volume is 100% |
| `CHECK_INTERVAL` | 500 | Milliseconds between proximity evaluations |

#### Volume Curve

```
distance ≤ 50px  → volume = 1.0
50 < distance ≤ 300px → volume = 1 - (distance - 50) / (300 - 50)
distance > 300px → connection torn down
```

#### Behavior

1. Reads `localPlayerId` and all `players` from `gameStore`.
2. If `inMeeting` is `true`, skips all proximity logic (meeting mode overrides).
3. For each remote player within `PROXIMITY_RADIUS`:
   - If not connected → calls `webRTCManager.connectToPeer()`.
   - Sets audio volume based on distance.
4. For previously connected peers now out of range → calls `webRTCManager.disconnectPeer()`.

---

### MeetingSystem (`src/modules/spatial/systems/MeetingSystem.ts`)

Subscribes to `gameStore` meeting state changes and manages the transition between proximity mode and full-room conferencing.

#### State Transitions

```
┌─────────────┐     zone:entered (MEETING)     ┌─────────────────┐
│  Proximity   │ ─────────────────────────────▸ │  Meeting Mode   │
│  Mode        │                                │  (full volume)  │
│              │ ◂───────────────────────────── │                 │
└─────────────┘     zone:left                   └─────────────────┘
```

| Transition | What happens |
|-----------|--------------|
| **Enter meeting** | Stop ProximitySystem, disconnect proximity peers, connect all meeting participants at full volume |
| **Peer joins room** | Connect to new participant immediately |
| **Peer leaves room** | Tear down that peer's connection |
| **Leave meeting** | Disconnect all meeting peers, restart ProximitySystem |

#### Store Integration

The MeetingSystem watches `gameStore` via `subscribeWithSelector`:

```typescript
useGameStore.subscribe(
  (state) => ({ inMeeting, participants, localPlayerId }),
  (current, previous) => this.handleStateChange(current, previous),
  { equalityFn: ... }
);
```

---

### NetworkManager — Signaling Wiring (`src/modules/spatial/systems/NetworkManager.ts`)

The NetworkManager forwards WebRTC signaling events between the Socket.IO transport and the WebRTCManager.

#### Signaling Events

| Socket Event | Direction | Handler |
|-------------|-----------|---------|
| `signal:offer` | Server → Client | `webRTCManager.handleOffer(fromUserId, offer)` |
| `signal:answer` | Server → Client | `webRTCManager.handleAnswer(fromUserId, answer)` |
| `signal:ice-candidate` | Server → Client | `webRTCManager.handleIceCandidate(fromUserId, candidate)` |
| `signal:offer` | Client → Server | Emitted by `webRTCManager.connectToPeer()` |
| `signal:answer` | Client → Server | Emitted by `webRTCManager.handleOffer()` |
| `signal:ice-candidate` | Client → Server | Emitted by `peer.onicecandidate` |

#### Meeting Events

| Socket Event | Handler |
|-------------|---------|
| `meeting:join` | `gameStore.enterMeeting(zoneId, participants)` |
| `meeting:peer-joined` | `gameStore.addMeetingParticipant(userId)` |
| `meeting:peer-left` | `gameStore.removeMeetingParticipant(userId)` |

#### Critical: Meeting Exit via `zone:left`

The backend does **not** emit a dedicated `meeting:leave` event to the client who walks out of a meeting zone. It only sends `zone:left` to the leaving client and `meeting:peer-left` to other participants. Therefore, the `zone:left` handler must detect and exit meeting mode:

```typescript
socketService.on('zone:left', () => {
  const state = useGameStore.getState();
  if (state.inMeeting) {
    state.leaveMeeting();
  }
  state.setCurrentZone(null);
});
```

---

## Media Initialization Flow

Media is initialized in `GameContainer.tsx` when the user enters the office:

```
User enters office
  └─▸ GameContainer mounts
       └─▸ initMedia() — requests mic/camera via getUserMedia
            ├─▸ Success: store stream → webRTCManager.setLocalStream(stream)
            └─▸ Failure: office works, but without voice/video
       └─▸ .finally() — start ProximitySystem + MeetingSystem
```

**Critical ordering**: ProximitySystem and MeetingSystem start **after** `initMedia()` resolves (or fails). This prevents a race condition where peer connections are created before the local stream is available, resulting in peers with zero media tracks.

---

## Store Integration

### Reads From

| Store | Data |
|-------|------|
| `gameStore` | `localPlayerId`, `players` (positions), `inMeeting`, `meetingParticipants`, `meetingZoneId` |
| `mediaStore` | `localStream` (for `setLocalStream`) |

### Writes To

| Store | Data |
|-------|------|
| `mediaStore` | `addRemoteStream`, `removeRemoteStream` (when peers connect/disconnect) |
| `gameStore` | `enterMeeting`, `addMeetingParticipant`, `removeMeetingParticipant`, `leaveMeeting` (via NetworkManager event handlers) |

---

## File Map

| File | Role |
|------|------|
| `src/core/services/webrtc.manager.ts` | Central WebRTC peer connection manager |
| `src/modules/spatial/systems/ProximitySystem.ts` | Distance-based connect/disconnect/volume |
| `src/modules/spatial/systems/MeetingSystem.ts` | Full-room conferencing mode |
| `src/modules/spatial/systems/NetworkManager.ts` | Signaling + meeting event forwarding |
| `src/core/store/media.store.ts` | Local/remote stream state |
| `src/core/store/game.store.ts` | Player positions + meeting state |
| `src/modules/spatial/ui/GameContainer.tsx` | Media init + system lifecycle |

---

## Known Limitations (POC)

1. **STUN only** — No TURN server configured. Connections may fail behind symmetric NATs or restrictive firewalls.
2. **No video rendering** — Remote video streams are stored in `mediaStore.remoteStreams` but not rendered in the UI yet (Phase 11).
3. **Volume steps** — `audioElement.volume` changes are instant (no smooth ramping). Acceptable at 500ms update intervals.
4. **Same-origin testing** — Both tabs on the same machine share the same microphone, so you hear your own environment echoed back.
