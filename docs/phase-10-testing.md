# Phase 10 — Testing Guide

## Prerequisites

1. Backend services running:
   - `aura-api` on `http://localhost:3000`
   - `aura-realtime` on `http://localhost:3001`
   - Redis and PostgreSQL accessible
2. Frontend dev server running: `npm run dev` → `http://localhost:5173`
3. At least two user accounts in the same company
4. An office with at least one LOBBY zone and one MEETING zone

---

## Test 1: Open-Office Proximity Audio

**Goal**: Verify that two users can hear each other when within proximity range.

### Steps

1. Open `http://localhost:5173` in Chrome Tab A. Log in as User A.
2. Open `http://localhost:5173` in Chrome Incognito Tab B. Log in as User B.
3. Both users select the same office.
4. Grant microphone/camera permissions when prompted on both tabs.
5. Both users spawn at the lobby center (same position).

### Expected Console Output (Tab A)

```
[WebRTCManager] Local stream set: Active
[ProximitySystem] Started
[WebRTCManager] Initiating connection to <User B ID>
[WebRTCManager] Received answer from <User B ID>
[WebRTCManager] Remote track received from <User B ID>
[WebRTCManager] Audio playback started for <User B ID>
[WebRTCManager] Flushing N buffered ICE candidates for <User B ID>
[WebRTCManager] Peer <User B ID> connection state: connected
```

### Expected Behavior

- Both users hear each other's microphone audio.
- The MediaToolbar shows mic/camera toggle buttons as active.

### Volume Distance Test

1. Move User A away from User B using WASD.
2. As distance increases past 50px, volume should gradually decrease.
3. At 300px distance, the connection should be torn down.
4. Move User A back within 300px — connection should re-establish.

---

## Test 2: Meeting Room Conferencing

**Goal**: Verify that entering a meeting zone switches to full-room conferencing.

### Steps

1. With both users in the office (from Test 1), walk both users into a MEETING zone.
2. Observe the zone badge change to the meeting room name.

### Expected Console Output

```
[MeetingSystem] Entered meeting mode
[MeetingSystem] Connecting to new participant <User ID>
[WebRTCManager] Initiating connection to <User ID>
...
[WebRTCManager] Peer <User ID> connection state: connected
```

### Expected Behavior

- ProximitySystem stops (no distance-based volume changes).
- All meeting participants hear each other at full volume regardless of position.
- The MediaToolbar mic/camera toggles still work.

---

## Test 3: Meeting Exit → Proximity Restore

**Goal**: Verify that leaving a meeting zone restores proximity mode.

### Steps

1. With both users inside a meeting zone, walk User A out of the zone.
2. Observe the zone badge clear.

### Expected Console Output (User A)

```
[MeetingSystem] Left meeting mode
[ProximitySystem] Started
```

### Expected Behavior

- Meeting peers are disconnected.
- ProximitySystem resumes distance-based connections.
- If User A is still within 300px of User B, a new proximity connection is established.

---

## Test 4: Tab Refresh Cleanup

**Goal**: Verify that refreshing a tab cleans up peer connections.

### Steps

1. Establish a WebRTC connection between two users (either proximity or meeting).
2. Refresh Tab A (F5 or Ctrl+R).

### Expected Behavior (Tab B Console)

```
[WebRTCManager] Peer <User A ID> connection state: disconnected
[WebRTCManager] Disconnected peer <User A ID>
```

- Tab B removes the disconnected peer.
- No orphaned connections remain.

---

## Test 5: Tab Close Cleanup

**Goal**: Verify that closing a tab triggers proper cleanup.

### Steps

1. Establish a WebRTC connection between two users.
2. Close Tab A entirely.

### Expected Behavior (Tab B Console)

- Same as Test 4 — the peer transitions to `disconnected`/`failed` and is cleaned up.

---

## Test 6: Media Permission Denied

**Goal**: Verify the office works without voice/video when media access is denied.

### Steps

1. Open a new browser tab. Block camera/microphone permissions for `localhost:5173`.
2. Log in and enter the office.

### Expected Console Output

```
[GameContainer] Media access denied or unavailable. Office will load without voice/video.
[ProximitySystem] Started
```

### Expected Behavior

- The office loads normally (Phaser world, HUD, movement).
- ProximitySystem runs but creates peer connections without tracks.
- Other users who have media enabled will see the connection but receive no audio/video from the denied user.
- MediaToolbar buttons show as disabled.

---

## Debugging Tips

### No Audio

1. Check that `[WebRTCManager] Audio playback started for <userId>` appears in the console.
2. Verify `[WebRTCManager] Peer <userId> connection state: connected` appears.
3. Make sure you're producing sound (speak, tap the microphone).
4. Check Chrome's tab audio indicator (speaker icon on the tab).

### Connection Not Establishing

1. Verify both users are in the same office.
2. Check that `[ProximitySystem] Started` appears AFTER `[WebRTCManager] Local stream set: Active`.
3. Check for signaling errors: `Error creating offer`, `Error handling offer`, etc.

### ICE Connection Failures

1. Check for `Flushing N buffered ICE candidates` — if N is very large, signaling might be too slow.
2. Verify the STUN server is reachable (try `stun:stun.l.google.com:19302` in browser WebRTC internals: `chrome://webrtc-internals`).
3. If behind a corporate firewall, you may need a TURN server.

### Chrome WebRTC Internals

For deep debugging, open `chrome://webrtc-internals` in a new tab. This shows:

- All active `RTCPeerConnection` instances
- ICE candidate gathering and connectivity checks
- SDP offer/answer details
- Media track statistics (bitrate, packets, codec)
