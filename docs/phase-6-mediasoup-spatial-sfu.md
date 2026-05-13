 # Phase 6: Mediasoup Spatial SFU Migration Plan

## Goal

Replace Project Aura's current P2P WebRTC mesh with a centralized Mediasoup SFU that acts as a server-side spatial media router.

This migration is split into two implementation phases:

- Phase 1 builds the audio-only SFU foundation. The backend decides which remote microphone streams each user is allowed to consume based on avatar distance and meeting-zone membership. The frontend consumes only the streams the backend creates, then continues to run local distance checks only to adjust HTML audio element volume smoothly.
- Phase 2 completes the POC by adding camera video, screen share, active speaker UI, SFU debug state, single-owner multi-instance safety, and production observability hooks.

Current projects:

- Backend: `D:\Echofox\project-aura`
- Frontend: `D:\Echofox\project-aura-fe`

Authoritative implementation docs to use while coding:

- Mediasoup v3 API: https://mediasoup.org/documentation/v3/mediasoup/api/
- Mediasoup client API: https://mediasoup.org/documentation/v3/mediasoup-client/api/
- Communication between client and server: https://mediasoup.org/documentation/v3/communication-between-client-and-server/

## Current State Audit

### Backend

The realtime app is in `apps/aura-realtime`.

Important existing pieces:

- `OfficeGateway` owns authenticated socket entry, `office:join`, `player:move`, zone detection, meeting zone entry/exit, `media:state`, and screen-share metadata.
- `SignalingGateway` relays `signal:offer`, `signal:answer`, and `signal:ice-candidate` for P2P WebRTC. This becomes obsolete for SFU media.
- `MeetingService` tracks `MEETING` participants in Redis by `zoneId`.
- `RedisService` already stores live `PlayerState` records with `x`, `y`, `currentZoneId`, and `currentZoneType`.
- `ZoneType.MEETING` already exists in `libs/database/src/entities/zone.entity.ts`.

Current backend media model:

```text
Client A <---- signal:* relay only ----> Client B
Client A <========= P2P media =========> Client B
```

Target backend media model:

```text
Client A ---- produce audio ----> Mediasoup Router for office
Client B ---- produce audio ----> Mediasoup Router for office

OfficeGateway player:move
        |
        v
SpatialAudioService checks Redis positions and zones
        |
        +--> creates/closes Mediasoup Consumers
        |
        +--> emits sfu:new-consumer / sfu:consumer-closed
```

### Frontend

Important existing pieces:

- `src/core/services/webrtc/webrtc.manager.ts` owns peer connections and exposes `connectToPeer`, `disconnectPeer`, `handleOffer`, `handleAnswer`, `handleIceCandidate`, and `setAudioVolume`.
- `src/core/services/webrtc/peer-connection.ts` wraps `RTCPeerConnection`.
- `src/core/services/webrtc/media-handler.ts` plays remote audio with in-memory HTML `<audio>` elements.
- `src/modules/spatial/systems/ProximitySystem.ts` currently both connects/disconnects peers and adjusts volume.
- `src/modules/spatial/systems/MeetingSystem.ts` currently starts/stops proximity and connects/disconnects meeting peers.
- `src/modules/spatial/systems/NetworkManager.ts` wires `signal:*` socket events into `WebRTCManager`.
- `src/core/store/media.store.ts` currently requests audio and video, imports `WebRTCManager` for camera/screen-share track replacement, and stores remote streams for UI.

Current frontend media model:

```text
ProximitySystem / MeetingSystem
        |
        v
WebRTCManager
        |
        v
RTCPeerConnection per remote user
```

Target frontend media model:

```text
GameContainer
        |
        v
SFUManager singleton
        |
        +--> mediasoup-client Device
        +--> one send WebRtcTransport
        +--> one recv WebRtcTransport
        +--> Phase 1 local mic Producer
        +--> Phase 2 local camera and screen Producers
        +--> remote Consumers keyed by userId + mediaTag

ProximitySystem
        |
        v
setAudioVolume(userId, volume) only for mic consumers
```

## Key Architecture Decisions

1. Deliver the SFU in two phases.
   - Produce only microphone audio from the client.
   - Consume only audio tracks from Mediasoup.
   - Keep remote `MediaStream` storage so existing audio/speaking UI can continue to work.
   - In Phase 1, disable or hide camera and screen-share controls until video and screen-share are explicitly added to the SFU.
   - In Phase 2, add camera and screen share as additional producers on the same send transport, identified by `appData.mediaTag`.

2. Use one Mediasoup `Router` per active office.
   - Create lazily when the first socket joins or asks for router RTP capabilities.
   - Close when the last SFU peer leaves the office.
   - Keep this single-instance for the current phase. Multi-instance SFU requires sticky routing, office-to-node ownership, or Mediasoup `PipeTransport`.

3. Use two WebRTC transports per user.
   - Send transport: browser produces microphone audio to the server.
   - Recv transport: browser consumes remote audio from the server.
   - The recv transport may be created lazily on the first `sfu:new-consumer`.

4. Make all Mediasoup request/response events use Socket.IO acknowledgements.
   - The current `socketService.emit()` returns `void`.
   - The frontend must add an ack helper such as `request(event, payload)` or `emitWithAck`.
   - The backend must return structured responses from `@SubscribeMessage` handlers.

5. The backend is the only source of truth for hard subscribe/unsubscribe.
   - Client distance checks no longer create or close media connections.
   - The client only adjusts audio volume for consumers the server already allowed.

6. Meeting zones override open-office distance.
   - Users in the same `ZoneType.MEETING` and same `zoneId` consume all participants in that meeting.
   - Users inside a meeting do not consume nearby users outside that same meeting.
   - Users outside meetings use `PROXIMITY_RADIUS = 300`.

7. Use `mediaTag` as the stable media identity.
   - `mic` is the Phase 1 audio producer.
   - `camera` is the Phase 2 user camera video producer.
   - `screen` is the Phase 2 screen video producer.
   - Optional future `screen-audio` must be treated as a separate audio producer and must not be mixed with microphone state.

8. Keep one send transport and one recv transport per user for the POC.
   - The same send transport can produce mic, camera, and screen tracks.
   - The same recv transport can consume every remote track.
   - Do not create one transport per media type unless load testing proves transport-level isolation is needed.

## Socket.IO SFU Contract

### Client to Server Requests

All client-to-server SFU events should be ack-based. If a request fails, return or throw a structured socket error; do not emit a separate success event.

#### `sfu:get-router-rtp-capabilities`

Payload:

```ts
{}
```

Ack response:

```ts
{
  rtpCapabilities: RtpCapabilities;
}
```

Server behavior:

- Require authenticated socket.
- Require `client.data.officeId`.
- Create or reuse the office Mediasoup router.
- Store that this socket has begun SFU setup for the office.

#### `sfu:create-webrtc-transport`

Payload:

```ts
{
  direction: 'send' | 'recv';
}
```

Ack response:

```ts
{
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
}
```

Server behavior:

- Require authenticated socket and office membership.
- Create exactly one send transport and one recv transport per socket.
- If a transport already exists for the direction, close and replace it only during explicit reinitialization; otherwise return the existing transport parameters.
- Use UDP preferred, TCP enabled as fallback.

#### `sfu:connect-transport`

Payload:

```ts
{
  transportId: string;
  dtlsParameters: DtlsParameters;
}
```

Ack response:

```ts
{
  connected: true;
}
```

Server behavior:

- Verify `transportId` belongs to the authenticated socket.
- Call `transport.connect({ dtlsParameters })`.

#### `sfu:produce`

Payload:

```ts
{
  transportId: string;
  kind: 'audio';
  rtpParameters: RtpParameters;
  appData?: {
    mediaTag?: 'mic';
  };
}
```

Ack response:

```ts
{
  producerId: string;
}
```

Server behavior:

- Verify transport belongs to the socket and is the send transport.
- Reject non-audio producers in this phase.
- Create a Mediasoup `Producer`.
- Store it on the user's SFU session as the microphone producer.
- Trigger spatial reconciliation for the office so eligible peers receive `sfu:new-consumer`.

#### `sfu:resume-consumer`

Payload:

```ts
{
  consumerId: string;
}
```

Ack response:

```ts
{
  resumed: true;
}
```

Server behavior:

- Verify the consumer belongs to the authenticated socket.
- Call `consumer.resume()`.
- Keep consumers paused on the server until the frontend has created its local consumer and is ready to play it.

### Server to Client Events

#### `sfu:new-consumer`

Payload:

```ts
{
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  kind: 'audio';
  rtpParameters: RtpParameters;
  type: ConsumerType;
  producerPaused: boolean;
  appData?: {
    mediaTag?: 'mic';
  };
}
```

Client behavior:

- Ensure the recv transport exists and is connected.
- Call `recvTransport.consume(...)`.
- Create `new MediaStream([consumer.track])`.
- Attach the stream to an in-memory HTML `<audio>` element.
- Store the stream in `mediaStore.remoteStreams[remoteUserId]`.
- Ack readiness by calling `sfu:resume-consumer`.

#### `sfu:consumer-closed`

Payload:

```ts
{
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  mediaTag: 'mic';
  reason:
    | 'out-of-range'
    | 'left-office'
    | 'left-meeting'
    | 'producer-closed'
    | 'transport-closed'
    | 'server-cleanup';
}
```

Note: Include `mediaTag` from Phase 1 even though only `mic` exists. This avoids a breaking contract change when Phase 2 adds `camera` and `screen`, and lets the frontend handler consistently switch on `mediaTag`.

Client behavior:

- Close and delete the matching local `Consumer`.
- Pause and remove the matching HTML audio element.
- Remove `mediaStore.remoteStreams[remoteUserId]`.
- Do not attempt a client-side reconnection. The server will emit a new consumer if the user becomes eligible again.

## Backend Implementation Plan

### Step 1: Install Mediasoup and add configuration

Add dependency in backend:

```powershell
npm install mediasoup
```

Add environment variables to `.env.example` and deployment docs:

```env
MEDIASOUP_WORKER_COUNT=1
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=49999
MEDIASOUP_LOG_LEVEL=warn

# TURN server for NAT traversal (required for production)
TURN_URL=
TURN_USERNAME=
TURN_CREDENTIAL=
```

Notes:

- Local development can use `MEDIASOUP_ANNOUNCED_IP=127.0.0.1`.
- LAN or production needs the public or reachable IP.
- Open UDP ports `40000-49999` in deployment environments.
- Mediasoup terminates WebRTC at the server, but clients behind symmetric NATs or corporate firewalls may not be able to reach the SFU directly. A TURN server (e.g. self-hosted `coturn`) is required for production, especially with multiple companies on different corporate networks. Expect ~10-20% of users to need the TURN relay path.
- Set `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` for production. Leave them empty for local development where TURN is not needed.

### Step 2: Create an SFU module

Add a new backend module under `apps/aura-realtime/src/sfu`.

Recommended structure:

```text
apps/aura-realtime/src/sfu/
  sfu.module.ts
  sfu.gateway.ts
  mediasoup.service.ts
  spatial-audio.service.ts
  sfu.types.ts
  sfu.constants.ts
  dto/
    create-webrtc-transport.dto.ts
    connect-transport.dto.ts
    produce.dto.ts
    resume-consumer.dto.ts
```

Wire `SfuModule` into `AuraRealtimeModule`.

Import `SfuModule` into `OfficeGatewayModule` so `OfficeGateway` can inject `SpatialAudioService`.

### Step 3: Implement `MediasoupService`

Responsibilities:

- Implement `OnModuleInit` and create a worker pool.
- Implement `OnModuleDestroy` and close routers, transports, producers, consumers, and workers.
- Expose `getOrCreateOfficeRoom(officeId)`.
- Expose helpers for creating transports, producers, and consumers.
- Own Mediasoup-specific lifecycle details; keep spatial policy in `SpatialAudioService`.

Worker startup:

```ts
const worker = await mediasoup.createWorker({
  rtcMinPort,
  rtcMaxPort,
  logLevel,
});

worker.on('died', () => {
  logger.error(`Mediasoup worker pid=${worker.pid} died`);

  // --- Graceful per-worker recovery ---
  // Do NOT call process.exit(). Killing the entire process for one dead
  // worker destroys all offices on every other worker. Instead:
  //   1. Find all SFU rooms that were assigned to the dead worker.
  //   2. Clean up their peers, transports, producers, and consumers.
  //   3. Emit sfu:consumer-closed with reason 'server-cleanup' to every
  //      affected client so they know to re-init.
  //   4. Spawn a replacement worker in the pool and resume normal
  //      round-robin assignment.
  const affectedRooms = this.getRoomsByWorker(worker);
  for (const room of affectedRooms) {
    this.cleanupRoom(room.officeId, 'worker-died');
  }
  this.replaceWorker(workerIndex).catch((err) => {
    logger.error('Failed to replace dead worker; exiting', err);
    process.exit(1);
  });
});
```

Note: Only escalate to `process.exit(1)` if the replacement worker itself fails to start. This keeps unaffected offices running while the damaged ones cleanly reconnect.

Router codecs for this phase:

```ts
const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];
```

Office room model:

```ts
interface OfficeSfuRoom {
  officeId: string;
  worker: Worker;
  router: Router;
  peers: Map<string, SfuPeer>; // userId -> peer
}

interface SfuPeer {
  userId: string;
  socketId: string;
  officeId: string;
  rtpCapabilities?: RtpCapabilities;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  micProducer?: Producer;
  consumers: Map<string, Consumer>; // consumerId -> consumer
  consumersByProducerId: Map<string, Consumer>;
}
```

Transport creation:

```ts
const transportOptions: WebRtcTransportOptions = {
  listenInfos: [
    {
      protocol: 'udp',
      ip: listenIp,
      announcedAddress: announcedIp,
    },
    {
      protocol: 'tcp',
      ip: listenIp,
      announcedAddress: announcedIp,
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  appData: { officeId, userId, direction },
};

// Add TURN relay for production environments where clients may be
// behind symmetric NATs or corporate firewalls.
if (process.env.TURN_URL) {
  transportOptions.iceServers = [
    {
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    },
  ];
}

const transport = await router.createWebRtcTransport(transportOptions);
```

If the installed Mediasoup version expects `listenIps` instead of `listenInfos`, use the API shape from the installed package and keep the same env-driven behavior.

Transport connection deadline:

After creating a transport, set a timeout for the client to connect it. If the DTLS handshake never completes, clean up the transport to avoid resource leaks:

```ts
const TRANSPORT_CONNECT_DEADLINE_MS = 30_000;

setTimeout(() => {
  if (transport.connectionState === 'new') {
    logger.warn(`Transport ${transport.id} for ${userId} never connected; closing`);
    transport.close();
    this.cleanupPeerTransport(userId, direction);
  }
}, TRANSPORT_CONNECT_DEADLINE_MS);
```

### Step 4: Implement `SfuGateway`

Responsibilities:

- Register the same JWT middleware pattern currently used by `OfficeGateway` and `SignalingGateway`.
- Handle all `sfu:*` client request events.
- Return ack payloads for request/response calls.
- Bind the Socket.IO `Server` instance into `SpatialAudioService` so that service can emit `sfu:new-consumer` and `sfu:consumer-closed` to target sockets.

Handlers:

```text
sfu:get-router-rtp-capabilities
sfu:create-webrtc-transport
sfu:connect-transport
sfu:produce
sfu:resume-consumer
```

Validation in every handler:

- Socket is authenticated.
- Socket has joined an office.
- User can only manage transports, producers, and consumers tied to their socket session.
- `kind` must be `audio` in this phase.
- Reject requests if the user's office router cannot consume or produce with the given RTP parameters.

### Step 5: Implement `SpatialAudioService`

Responsibilities:

- Store no position truth of its own; read current positions and zones from Redis.
- Compare desired directed subscriptions with active Mediasoup consumers.
- Create missing consumers.
- Close stale consumers.
- Use throttled reconciliation for movement. Run immediately for zone changes, office join, producer creation, and disconnect cleanup.

Core policy:

```ts
function shouldReceiveAudio(receiver: PlayerState, producer: PlayerState): boolean {
  if (receiver.userId === producer.userId) return false;

  const receiverInMeeting = receiver.currentZoneType === ZoneType.MEETING;
  const producerInMeeting = producer.currentZoneType === ZoneType.MEETING;

  if (receiverInMeeting || producerInMeeting) {
    return (
      receiverInMeeting &&
      producerInMeeting &&
      receiver.currentZoneId === producer.currentZoneId
    );
  }

  const dx = receiver.x - producer.x;
  const dy = receiver.y - producer.y;
  return Math.sqrt(dx * dx + dy * dy) <= 300;
}
```

Reconciliation throttling:

`player:move` fires at ~15 fps per user. With N users that is N * 15 calls per second. Running a full O(N²) reconciliation on every movement tick causes a scalability bottleneck beyond ~20 users per office. Instead, throttle movement-triggered reconciliation per office:

```ts
private reconcileTimers: Map<string, NodeJS.Timeout> = new Map();

/**
 * Schedule a throttled reconciliation for an office.
 * Multiple calls within the debounce window collapse into one.
 */
scheduleReconcile(officeId: string): void {
  if (this.reconcileTimers.has(officeId)) return; // already scheduled

  const timer = setTimeout(async () => {
    this.reconcileTimers.delete(officeId);
    await this.reconcileOffice(officeId);
  }, 500); // 500 ms debounce

  this.reconcileTimers.set(officeId, timer);
}

/**
 * Run reconciliation immediately. Use for zone changes, join, leave,
 * producer creation, and disconnect — events where the consumer graph
 * must update without delay.
 */
async reconcileNow(officeId: string): Promise<void> {
  // Cancel any pending throttled run so it does not double-fire.
  const pending = this.reconcileTimers.get(officeId);
  if (pending) {
    clearTimeout(pending);
    this.reconcileTimers.delete(officeId);
  }
  await this.reconcileOffice(officeId);
}
```

Full office reconciliation:

```text
for each receiver peer with recvTransport and rtpCapabilities:
  for each producer peer with micProducer:
    desired = shouldReceiveAudio(receiverPlayer, producerPlayer)
    active = receiverPeer.consumersByProducerId.has(producer.id)

    if desired and not active:
      create consumer paused=true
      store consumer
      emit sfu:new-consumer to receiver.socketId

    if not desired and active:
      close consumer
      delete consumer
      emit sfu:consumer-closed to receiver.socketId
```

Redis optimization: Inside `reconcileOffice`, fetch all player states in a single batch using `redisService.getPlayersInOffice(officeId)` (one `HGETALL` call) instead of individual `getPlayerState()` per peer. This reduces Redis roundtrips from O(N) to O(1) per reconciliation run.

Consumer rate limiting: Cap the number of consumers created in a single reconciliation run (for example `MAX_CONSUMERS_PER_RECONCILE = 50`). If more are needed, schedule another reconcile tick immediately after the current one completes. This prevents reconnection storms from overwhelming the event loop.

Consumer creation details:

- Use `router.canConsume({ producerId, rtpCapabilities })` before consuming.
- Create server consumers with `paused: true`.
- Include `remoteUserId` in `consumer.appData`.
- Emit `sfu:new-consumer` only after the consumer is stored.
- Resume only when the client calls `sfu:resume-consumer`.

Stale consumer closure triggers:

- Distance exceeds 300 px in open-office mode.
- Either side enters a different meeting zone.
- Either side leaves the office.
- Producer closes.
- Receiver recv transport closes.
- Server cleanup.

### Step 6: Integrate SFU lifecycle into `OfficeGateway`

Modify `OfficeGateway` carefully because it is the current source of movement and zone truth.

On `office:join`:

- After access checks and `client.join(officeRoom)`, call `mediasoupService.getOrCreateOfficeRoom(office.id)` or `spatialAudioService.registerOfficePeer(client, office.id)`.
- Do not require media setup before office entry. Users should still enter the office even if microphone access later fails.
- Keep existing `office:state` and `player:joined` behavior unchanged.

On `player:move`:

- Keep the existing Redis position update and `player:moved` broadcast.
- If the zone does not change, call `spatialAudioService.scheduleReconcile(officeId)` (throttled, 500 ms debounce). Do not call `reconcileNow` on every move — this is the critical scalability fix.
- If the zone changes:
  - Run existing `setPlayerZone`, `handleZoneExit`, and `handleZoneEntry`.
  - Then call `spatialAudioService.reconcileNow(officeId)` (immediate, not throttled).
- Zone transitions must reconcile immediately because meeting override must use the updated Redis `currentZoneId` and `currentZoneType`.
- Normal movement uses the throttled path so que N users × 15 fps does not cause N² × 15 reconciliations per second.

On disconnect:

- Before or during normal presence cleanup, call `spatialAudioService.removePeer(officeId, userId, 'left-office')`.
- Close the user's transports, producer, and consumers.
- Close all consumers in other peers that point at the departing user's producer.
- Then keep the existing zone, meeting, screen-share, and `player:left` cleanup.

On `media:state`:

- Keep as-is for mic state UI.
- The SFU mute path should be track-based: toggling the local mic disables the audio track, while `media:state` still tells peers how to render mute indicators.

### Step 7: Retire `SignalingGateway` for media

Implementation options:

1. Remove `SignalingGatewayModule` from `AuraRealtimeModule` and delete the old DTOs/specs after frontend migration.
2. Keep it temporarily but leave the frontend with no `signal:*` listeners or emitters.

Recommended for this phase:

- Keep the files during the first SFU implementation to reduce churn.
- Stop importing `SignalingGatewayModule` only after the frontend build is green with no `signal:*` usage.
- Delete or rewrite `signaling.gateway.spec.ts` after the final cleanup commit.

### Step 8: Backend tests

Add unit coverage before manual browser testing.

`MediasoupService` tests:

- Creates workers on module init.
- Creates one router per office and reuses it.
- Creates send and recv transports with expected app data.
- Closes room resources when the last peer leaves.

Use mocks for Mediasoup primitives. Do not require real UDP ports in unit tests.

`SfuGateway` tests:

- Rejects requests before `office:join`.
- Returns router RTP capabilities.
- Creates send and recv transport responses.
- Connects only transports owned by the socket.
- Produces only audio.
- Resumes only consumers owned by the socket.

`SpatialAudioService` tests:

- Creates directed consumers for users within 300 px.
- Closes directed consumers when users move beyond 300 px.
- Creates consumers for all participants in the same `MEETING` zone regardless of distance.
- Does not connect users inside different meeting zones.
- Does not connect a meeting participant to a nearby user outside the meeting.
- Cleans up all consumers for a departing producer.

`OfficeGateway` integration tests:

- Same-zone movement calls spatial reconciliation.
- Zone transitions call reconciliation after Redis zone state changes.
- Disconnect removes the SFU peer and then emits existing presence/meeting events.

Backend verification commands:

```powershell
cmd /c npm test -- --runInBand
cmd /c npx nest build aura-realtime
```

## Frontend Implementation Plan

### Step 1: Install `mediasoup-client`

Run from `D:\Echofox\project-aura-fe`:

```powershell
npm install mediasoup-client
```

### Step 2: Update shared Socket.IO types

Modify `src/core/types.ts`.

Add SFU DTO types:

```ts
export type SfuTransportDirection = 'send' | 'recv';

export interface SfuTransportOptions {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
}

export interface SfuNewConsumerPayload {
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  kind: 'audio';
  rtpParameters: unknown;
  type: string;
  producerPaused: boolean;
  appData?: {
    mediaTag?: 'mic';
  };
}

export interface SfuConsumerClosedPayload {
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  reason: string;
}
```

Prefer importing Mediasoup client types once the package is installed:

```ts
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup-client/lib/types';
```

Remove or deprecate `SignalOfferRequest`, `SignalAnswerRequest`, and `SignalIceCandidateRequest` after all `signal:*` usage is gone.

### Step 3: Add an ack helper to `SocketService`

Add a Promise-based request method because Mediasoup handshakes are request/response driven.

Example public API:

```ts
request<EventName extends keyof SocketClientToServerAckEvents>(
  event: EventName,
  payload: Parameters<SocketClientToServerAckEvents[EventName]>[0],
): Promise<Awaited<ReturnType<SocketClientToServerAckEvents[EventName]>>>
```

Implementation behavior:

- Use `socket.timeout(10000).emitWithAck(event, payload)`.
- Convert timeout errors into readable `Error` objects.
- Keep existing `emit`, `on`, and `off` for fire-and-forget events.

### Step 4: Replace `WebRTCManager` with `SFUManager`

Recommended files:

```text
src/core/services/sfu/sfu.manager.ts
src/core/services/sfu/sfu-media-handler.ts
```

Then remove or stop importing:

```text
src/core/services/webrtc/webrtc.manager.ts
src/core/services/webrtc/peer-connection.ts
```

The existing `MediaHandler` logic can be moved or adapted because it already uses the correct playback model: in-memory HTML `<audio>` elements with `.volume`.

`SFUManager` state:

```ts
private device: Device | null;
private sendTransport: Transport | null;
private recvTransport: Transport | null;
private audioProducer: Producer | null;
private consumersById: Map<string, Consumer>;
private consumerIdByUserId: Map<string, string>;
private localStream: MediaStream | null;
private initialized = false;
private reinitializing = false;
```

Public API:

```ts
init(): Promise<void>
setLocalStream(stream: MediaStream | null): void
startAudioProducer(): Promise<void>
handleNewConsumer(payload: SfuNewConsumerPayload): Promise<void>
handleConsumerClosed(payload: SfuConsumerClosedPayload): void
setAudioVolume(userId: string, volume: number): void
replaceAudioTrack(track: MediaStreamTrack | null): Promise<void>
reinitialize(): Promise<void>
disconnectAll(): void
destroy(): void
```

Initialization flow:

```text
1. Request sfu:get-router-rtp-capabilities.
2. Create mediasoup-client Device.
3. device.load({ routerRtpCapabilities }).
4. Register socket listeners for sfu:new-consumer and sfu:consumer-closed.
5. Create send transport.
6. Connect send transport via sfu:connect-transport when transport emits "connect".
7. Produce local microphone track via transport.produce().
8. The transport "produce" callback calls sfu:produce and receives producerId.
9. Create recv transport lazily when the first sfu:new-consumer arrives.
```

Transport ICE failure detection and reconnection:

The frontend must handle mid-session transport failures (server restart, network blip) gracefully. Wire each transport's `connectionstatechange` event:

```ts
transport.on('connectionstatechange', (state: string) => {
  if (state === 'failed' || state === 'disconnected') {
    console.warn(`[SFUManager] ${direction} transport ${state}, attempting re-init...`);
    this.handleTransportFailure(direction);
  }
});
```

Reconnection method:

```ts
async reinitialize(): Promise<void> {
  if (this.reinitializing) return; // prevent re-entrant calls
  this.reinitializing = true;

  try {
    this.destroy();

    // Small delay for server-side cleanup of the old session.
    await new Promise((r) => setTimeout(r, 1500));

    await this.init();
    if (this.localStream) {
      this.setLocalStream(this.localStream);
      await this.startAudioProducer();
    }
  } finally {
    this.reinitializing = false;
  }
}

private handleTransportFailure(direction: 'send' | 'recv'): void {
  // If the send transport fails, the user loses their mic producer.
  // If the recv transport fails, the user loses all remote audio.
  // Either way, a full reinit is the safest recovery path.
  this.reinitialize().catch((err) => {
    console.error('[SFUManager] Reinitialize failed:', err);
  });
}
```

Do not retry indefinitely. After 3 consecutive failed re-init attempts, surface a user-facing error and stop retrying.

Send transport callbacks:

```ts
transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
  try {
    await socketService.request('sfu:connect-transport', {
      transportId: transport.id,
      dtlsParameters,
    });
    callback();
  } catch (error) {
    errback(error as Error);
  }
});

transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
  try {
    const { producerId } = await socketService.request('sfu:produce', {
      transportId: transport.id,
      kind,
      rtpParameters,
      appData,
    });
    callback({ id: producerId });
  } catch (error) {
    errback(error as Error);
  }
});
```

Recv consumer flow:

```ts
const consumer = await recvTransport.consume({
  id: payload.consumerId,
  producerId: payload.producerId,
  kind: payload.kind,
  rtpParameters: payload.rtpParameters,
});

const stream = new MediaStream([consumer.track]);
mediaHandler.setupAudioPlayback(payload.remoteUserId, stream);
useMediaStore.getState().addRemoteStream(payload.remoteUserId, stream);

await socketService.request('sfu:resume-consumer', {
  consumerId: payload.consumerId,
});
```

### Step 5: Update media initialization to audio-first

Modify `src/core/store/media.store.ts`.

For this SFU phase:

- Change `initMedia()` to request microphone audio only:

```ts
navigator.mediaDevices.getUserMedia({
  audio: true,
  video: false,
});
```

- Keep `localStream`, `isMicOn`, and `isMediaInitialized`.
- Set `isCameraOn` to `false`.
- Keep `toggleMic()` as track enable/disable plus `media:state`.
- Remove `WebRTCManager` imports from camera and screen-share actions.
- Hide or disable camera and screen-share controls in the UI until video support is added to the SFU.

If preserving the current function names is less disruptive, keep `initMedia`, `toggleCamera`, and screen-share methods but make video/screen-share unavailable in this phase with clear no-op behavior and no P2P fallback.

### Step 6: Update `GameContainer`

Modify `src/modules/spatial/ui/GameContainer.tsx`.

New lifecycle:

```text
GameContainer mounts after office selection
  |
  +--> initMedia()
  |
  +--> sfuManager.init()
  |
  +--> sfuManager.setLocalStream(localStream)
  |
  +--> sfuManager.startAudioProducer()
  |
  +--> meetingSystem.init()
  |
  +--> proximitySystem.start()
  |
  +--> boot Phaser OfficeScene
```

Cleanup:

```text
meetingSystem.destroy()
proximitySystem.stop()
sfuManager.destroy()
stopMedia()
destroy Phaser game
```

Important race condition:

- Register `sfu:new-consumer` listeners inside `sfuManager.init()` before producing audio.
- This prevents missing a server-created consumer if another user is already in range.

### Step 7: Update `NetworkManager`

Modify `src/modules/spatial/systems/NetworkManager.ts`.

Remove:

```text
signal:offer
signal:answer
signal:ice-candidate
webRTCManager.handleOffer
webRTCManager.handleAnswer
webRTCManager.handleIceCandidate
```

Keep:

```text
player:joined
player:left
player:moved
zone:entered
zone:left
meeting:join
meeting:peer-joined
meeting:peer-left
screenshare:* metadata only if UI still displays it
media:state
```

Recommended:

- Let `SFUManager` own `sfu:new-consumer` and `sfu:consumer-closed` listeners.
- Keep `NetworkManager` focused on spatial state and UI state.

On `player:left`:

- Remove player from `gameStore`.
- Do not call client-side media disconnect directly unless the server also sends `sfu:consumer-closed`. The server should be authoritative.
- As a safety cleanup, `SFUManager` may expose `cleanupUser(userId)` and call it if a player disappears without a consumer-closed event.

### Step 8: Update `ProximitySystem`

Modify `src/modules/spatial/systems/ProximitySystem.ts`.

Remove:

```ts
connectedPeers: Set<string>
webRTCManager.connectToPeer(userId)
webRTCManager.disconnectPeer(userId)
disconnectAll()
```

Keep only volume adjustment:

```text
every 500 ms:
  read local player and remote players from gameStore
  read active remote audio users from mediaStore.remoteStreams or sfuManager
  if local user is in a MEETING zone:
    set volume = 1 for all active meeting participant consumers
  else:
    calculate distance for each active remote audio user
    set volume with the existing fade curve inside 300 px
    set volume = 0 for any stale active stream beyond 300 px while waiting for server close
```

Volume curve remains:

```text
distance <= 50 px: volume = 1
50 < distance <= 300 px: volume = 1 - ((distance - 50) / (300 - 50))
distance > 300 px: volume = 0 until sfu:consumer-closed arrives
```

Meeting behavior:

- Do not stop `ProximitySystem` during meetings.
- In meetings, set all same-zone participants to full volume.
- Do not apply distance attenuation inside the meeting zone unless a future product decision asks for spatialized meeting audio.

### Step 9: Update `MeetingSystem`

Modify `src/modules/spatial/systems/MeetingSystem.ts`.

Remove all direct media connection responsibility:

```text
webRTCManager.connectToPeer
webRTCManager.disconnectPeer
proximitySystem.stop
proximitySystem.start
connectedParticipants as media connection state
```

Keep or simplify meeting UI state behavior:

- `meeting:join` still calls `gameStore.enterMeeting(zoneId, participants)`.
- `meeting:peer-joined` still adds a participant.
- `meeting:peer-left` still removes a participant.
- Leaving a meeting via `zone:left` still calls `gameStore.leaveMeeting()`.

The backend SFU now creates and closes media consumers for meeting participants.

### Step 10: Update UI for audio-only SFU

Current `MeetingOverlay`, `ProximityIndicator`, and `VideoTile` can still render fallback avatars because remote streams may contain only audio tracks.

Required UI changes:

- Hide camera toggle until video SFU is implemented.
- Hide screen-share toggle until screen-share SFU is implemented.
- Ensure remote participant tiles pass `isCameraOn={false}` unless video tracks are actually present.
- Keep mute state rendering from `media:state`.
- Keep speaking detection, since `VideoTile` already analyzes audio tracks from the stream.

Optional polish:

- Rename internal UI copy from "video" to "media" or "audio" where visible.
- Show active audio participants in the proximity bubble strip even without video.

### Step 11: Remove P2P-only files and imports

After the SFU path builds:

- Delete `src/core/services/webrtc/peer-connection.ts`.
- Delete or replace `src/core/services/webrtc/webrtc.manager.ts`.
- Move/reuse `media-handler.ts` under `src/core/services/sfu`.
- Remove all frontend `signal:*` event types.
- Remove all backend `signal:*` frontend dependencies.
- Remove old P2P docs or mark them superseded by this phase.

### Step 12: Frontend tests and verification

Automated checks:

```powershell
cd D:\Echofox\project-aura-fe
npm run build
npm run lint
```

Recommended unit tests or component tests:

- `SocketService.request()` resolves ack responses.
- `SocketService.request()` rejects on timeout.
- `ProximitySystem` calls `sfuManager.setAudioVolume()` and never calls connect/disconnect.
- `MeetingSystem` updates store state but never opens media connections.
- `SFUManager.handleNewConsumer()` stores a remote stream and resumes the consumer.
- `SFUManager.handleConsumerClosed()` cleans local state and audio elements.

Manual browser checks:

1. Two users join the same office and allow microphone access.
2. User B starts outside 300 px from User A.
   - Expected: no remote audio consumer for either side.
3. User B walks within 300 px.
   - Expected: backend emits `sfu:new-consumer` to eligible receivers.
   - Expected: audio becomes audible.
4. Move from 300 px toward 50 px.
   - Expected: audio volume fades up smoothly.
5. Move beyond 300 px.
   - Expected: backend emits `sfu:consumer-closed`.
   - Expected: audio disappears and remote stream is removed.
6. Both users enter the same meeting zone.
   - Expected: both receive each other's audio regardless of distance inside that zone.
7. One user leaves the meeting zone.
   - Expected: meeting consumer closes unless they are also within open-office range after leaving.
8. Refresh one browser tab.
   - Expected: backend closes transports/producers/consumers and the other tab receives cleanup.

## Phase 2: Full POC Media and Operations Refactor Plan

Phase 2 starts after the Phase 1 audio SFU is working end to end. It completes the POC by adding camera video, screen share, active speaker UI, debug visibility, single-owner multi-instance safety, and production metrics hooks.

Phase 2 must not reintroduce `RTCPeerConnection` mesh logic or `signal:*` events. All media remains Mediasoup-based.

### Phase 2A: Backend media model refactor

Extend the SFU model from one microphone producer per user to multiple tagged producers per user.

Required producer tags:

```ts
export type SfuMediaTag = 'mic' | 'camera' | 'screen';
```

Reserved future tag:

```ts
export type FutureSfuMediaTag = 'screen-audio';
```

Refactor `SfuPeer`:

```ts
interface SfuPeer {
  userId: string;
  socketId: string;
  officeId: string;
  rtpCapabilities?: RtpCapabilities;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producers: Map<SfuMediaTag, Producer>;
  consumers: Map<string, Consumer>;
  consumersByProducerId: Map<string, Consumer>;
}
```

Producer app data:

```ts
interface SfuProducerAppData {
  officeId: string;
  userId: string;
  mediaTag: SfuMediaTag;
}
```

Consumer app data:

```ts
interface SfuConsumerAppData {
  officeId: string;
  receiverUserId: string;
  remoteUserId: string;
  producerId: string;
  mediaTag: SfuMediaTag;
}
```

Router codecs:

- Keep Opus for `mic`.
- Add VP8 for `camera` and `screen`.
- Do not add H264 in this POC unless Safari support becomes a hard requirement.

Recommended codec list:

```ts
const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];
```

Simulcast for camera producers:

With multiple users sending video, bandwidth can quickly become a bottleneck. Camera producers should use simulcast so the SFU can forward different resolutions to receivers based on available bandwidth:

```ts
// Frontend: camera producer with simulcast
const cameraProducer = await sendTransport.produce({
  track: cameraTrack,
  encodings: [
    { maxBitrate: 100_000, scaleResolutionDownBy: 4 },  // Low ~180p
    { maxBitrate: 300_000, scaleResolutionDownBy: 2 },  // Medium ~360p
    { maxBitrate: 900_000 },                              // High ~720p
  ],
  codecOptions: {
    videoGoogleStartBitrate: 300,
  },
  appData: { mediaTag: 'camera' },
});
```

Screen share should NOT use simulcast because it needs full resolution:

```ts
// Frontend: screen producer without simulcast
const screenProducer = await sendTransport.produce({
  track: screenTrack,
  encodings: [{ maxBitrate: 2_000_000 }],
  appData: { mediaTag: 'screen' },
});
```

On the server, use `consumer.setPreferredLayers()` to adapt quality per receiver.

### Phase 2B: Backend signaling contract extensions

Extend the existing Phase 1 contract instead of creating new event families.

#### Update `sfu:produce`

Payload:

```ts
{
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
  appData: {
    mediaTag: 'mic' | 'camera' | 'screen';
  };
}
```

Validation:

- `mic` must use `kind: 'audio'`.
- `camera` must use `kind: 'video'`.
- `screen` must use `kind: 'video'`.
- A user can have at most one active producer for each `mediaTag`.
- If the same user produces an existing `mediaTag` again, close the old producer and its consumers before storing the new producer.

Ack response:

```ts
{
  producerId: string;
}
```

Backend side effects:

- Store producer in `peer.producers.set(mediaTag, producer)`.
- Attach `producer.on('transportclose')` and `producer.on('close')` cleanup handlers.
- If `mediaTag === 'screen'`, emit the existing `screenshare:start` event to the office room with `{ userId }`.
- Reconcile the office so eligible receivers consume the new producer.

#### Add `sfu:close-producer`

Payload:

```ts
{
  producerId?: string;
  mediaTag?: 'camera' | 'screen' | 'mic';
}
```

Ack response:

```ts
{
  closed: true;
}
```

Server behavior:

- Find the authenticated user's producer by `producerId` or `mediaTag`.
- Close the producer.
- Close every consumer that points at that producer.
- Emit `sfu:consumer-closed` to each receiver.
- If `mediaTag === 'screen'`, emit existing `screenshare:stop` to the office room with `{ userId }`.
- If `mediaTag === 'mic'`, allow the user to stay in the office without audio until they produce `mic` again.

#### Add `sfu:pause-producer`

Payload:

```ts
{
  mediaTag: 'mic' | 'camera' | 'screen';
}
```

Ack response:

```ts
{
  paused: true;
}
```

Server behavior:

- Verify the producer belongs to the socket.
- Call `producer.pause()`.
- Keep the existing `media:state` event as the UI source for mic/camera indicators.
- Do not close consumers just because a producer is paused.

#### Add `sfu:resume-producer`

Payload:

```ts
{
  mediaTag: 'mic' | 'camera' | 'screen';
}
```

Ack response:

```ts
{
  resumed: true;
}
```

Server behavior:

- Verify the producer belongs to the socket.
- Call `producer.resume()`.
- Reconcile the office in case receivers became eligible while the producer was paused.

#### Update `sfu:new-consumer`

Payload:

```ts
{
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
  type: ConsumerType;
  producerPaused: boolean;
  appData: {
    mediaTag: 'mic' | 'camera' | 'screen';
  };
}
```

Client behavior:

- `mic`: create a `MediaStream`, attach it to the audio playback handler, store it as remote mic media.
- `camera`: create a `MediaStream`, store it as remote camera media, render it in participant tiles.
- `screen`: create a `MediaStream`, store it as remote screen media, render it in the screen-share view.

#### Update `sfu:consumer-closed`

Payload:

```ts
{
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  mediaTag: 'mic' | 'camera' | 'screen';
  reason:
    | 'out-of-range'
    | 'left-office'
    | 'left-meeting'
    | 'producer-closed'
    | 'transport-closed'
    | 'server-cleanup';
}
```

Client behavior:

- Close only the matching consumer.
- Remove only the matching `mediaTag` stream for `remoteUserId`.
- If the closed tag is `mic`, also remove the HTML audio element.
- If the closed tag is `screen`, remove the remote user from `screenSharingUsers`.

### Phase 2C: Backend spatial routing for camera and screen share

Apply one routing policy to all POC media tags:

```ts
function shouldReceiveProducer(
  receiver: PlayerState,
  producerOwner: PlayerState,
  mediaTag: SfuMediaTag,
): boolean {
  if (receiver.userId === producerOwner.userId) return false;

  const receiverInMeeting = receiver.currentZoneType === ZoneType.MEETING;
  const producerInMeeting = producerOwner.currentZoneType === ZoneType.MEETING;

  if (receiverInMeeting || producerInMeeting) {
    return (
      receiverInMeeting &&
      producerInMeeting &&
      receiver.currentZoneId === producerOwner.currentZoneId
    );
  }

  const dx = receiver.x - producerOwner.x;
  const dy = receiver.y - producerOwner.y;
  return Math.sqrt(dx * dx + dy * dy) <= 300;
}
```

Behavior by media tag:

- `mic`: same as Phase 1. Volume is still client-side.
- `camera`: consume for the same users who are eligible to receive that user's mic.
- `screen`: consume for the same users who are eligible to receive that user's mic. This supports nearby open-office screen sharing and full meeting-room screen sharing.

Reconciliation loop update:

```text
for each receiver peer with recvTransport and rtpCapabilities:
  for each producer peer:
    for each producer in producerPeer.producers:
      desired = shouldReceiveProducer(receiverPlayer, producerPlayer, mediaTag)
      active = receiverPeer.consumersByProducerId.has(producer.id)

      if desired and not active:
        create consumer paused=true
        store consumer
        emit sfu:new-consumer with mediaTag

      if not desired and active:
        close consumer
        delete consumer
        emit sfu:consumer-closed with mediaTag
```

Additional cleanup requirements:

- When a `screen` producer closes, broadcast `screenshare:stop` even if the close came from transport failure.
- When a user disconnects, close all their tagged producers before removing the peer.
- When a recv transport closes, close all consumers owned by that receiver but do not close remote producers.

### Phase 2D: Frontend media store refactor

The current `remoteStreams: Record<string, MediaStream>` is not enough because one remote user can now have mic, camera, and screen tracks at the same time.

Replace it with tagged remote media:

```ts
export type RemoteMediaTag = 'mic' | 'camera' | 'screen';

export interface RemoteUserMedia {
  mic?: MediaStream;
  camera?: MediaStream;
  screen?: MediaStream;
}

interface MediaStoreData {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteMedia: Record<string, RemoteUserMedia>;
  screenSharingUsers: string[];
  peerMediaStates: Record<string, { isMicOn: boolean; isCameraOn: boolean }>;
}
```

Add store actions:

```ts
setRemoteMediaStream(userId: string, mediaTag: RemoteMediaTag, stream: MediaStream): void
removeRemoteMediaStream(userId: string, mediaTag: RemoteMediaTag): void
removeAllRemoteMediaForUser(userId: string): void
clearAllRemoteMedia(): void
getRemoteMediaStream(userId: string, mediaTag: RemoteMediaTag): MediaStream | null
```

Compatibility rule:

- Remove `remoteStreams` once all UI code uses `remoteMedia`.
- If migration needs to be incremental, expose derived selectors for `remoteCameraStreams`, `remoteMicStreams`, and `remoteScreenStreams`, not a single ambiguous stream map.

Local media rules:

- `initMedia()` should request both mic and camera for the full POC:

```ts
navigator.mediaDevices.getUserMedia({
  audio: true,
  video: true,
});
```

- If camera permission fails but mic succeeds, keep the office usable with mic only.
- If mic permission fails but camera succeeds, allow camera-only presence and skip `mic` production.
- If both fail, allow office navigation with no media producers.

### Phase 2E: Frontend `SFUManager` producer refactor

Refactor `SFUManager` from one audio producer to a tagged producer map.

State:

```ts
private producersByTag: Map<'mic' | 'camera' | 'screen', Producer>;
private consumersById: Map<string, Consumer>;
private consumersByUserAndTag: Map<string, Consumer>;
```

Key format:

```ts
function getUserTagKey(userId: string, mediaTag: RemoteMediaTag): string {
  return `${userId}:${mediaTag}`;
}
```

Public API additions:

```ts
startMicProducer(track: MediaStreamTrack): Promise<void>
pauseMicProducer(): Promise<void>
resumeMicProducer(): Promise<void>
startCameraProducer(track: MediaStreamTrack): Promise<void>
stopCameraProducer(): Promise<void>
replaceCameraTrack(track: MediaStreamTrack): Promise<void>
startScreenShareProducer(track: MediaStreamTrack): Promise<void>
stopScreenShareProducer(): Promise<void>
closeProducer(mediaTag: 'mic' | 'camera' | 'screen'): Promise<void>
```

Consumer handling:

```text
handleNewConsumer(payload):
  ensure recv transport
  consume with payload kind and rtpParameters
  store consumer by consumerId
  store consumer by `${remoteUserId}:${mediaTag}`

  if mediaTag is mic:
    create MediaStream([track])
    setup HTML audio playback
    mediaStore.setRemoteMediaStream(remoteUserId, 'mic', stream)

  if mediaTag is camera:
    create MediaStream([track])
    mediaStore.setRemoteMediaStream(remoteUserId, 'camera', stream)

  if mediaTag is screen:
    create MediaStream([track])
    mediaStore.setRemoteMediaStream(remoteUserId, 'screen', stream)
    mediaStore.addScreenSharingUser(remoteUserId)

  request sfu:resume-consumer
```

Producer handling:

- Mic mute should call `track.enabled = false`, emit `media:state`, and call `sfu:pause-producer` for `mic`.
- Mic unmute should call `track.enabled = true`, emit `media:state`, and call `sfu:resume-producer` for `mic`.
- Camera off should close the `camera` producer, stop the camera track to release hardware, and emit `media:state`.
- Camera on should acquire a new camera track and call `startCameraProducer`.
- Screen share start should call `getDisplayMedia({ video: true, audio: false })` and produce the screen video track with `mediaTag: 'screen'`.
- Screen share stop should call `sfu:close-producer` for `screen`, stop local screen tracks, and clear local screen state.
- The browser's native screen-share stop button must call `stopScreenShareProducer()` through the track `ended` event.

### Phase 2F: Frontend UI refactor for tagged media

Refactor `VideoTile` so it can render video and analyze audio from separate streams.

New props:

```ts
interface VideoTileProps {
  videoStream: MediaStream | null;
  audioStream?: MediaStream | null;
  userName: string;
  userId: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isCameraOn?: boolean;
  isScreenShare?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'full';
  shape?: 'circle' | 'rect';
}
```

Rules:

- Attach `videoStream` to the `<video>` element.
- Use `audioStream` for speaking detection.
- Never play audio through the video element. Audio playback remains owned by the SFU media handler and hidden `<audio>` elements.
- For local self-view, `videoStream` is `localStream` or `screenStream`; `audioStream` is `localStream`.
- For remote participant tiles, `videoStream` is `remoteMedia[userId].camera`; `audioStream` is `remoteMedia[userId].mic`.
- For remote screen share, `videoStream` is `remoteMedia[userId].screen`; `audioStream` remains the user's mic stream.

Update `MeetingOverlay`:

- Restore the camera button.
- Restore the screen-share button.
- Use `remoteMedia[userId].camera` for participant tiles.
- Use `remoteMedia[userId].screen` for featured screen share.
- Keep local screen share rendering from `screenStream`.
- Show fallback initials when camera video is absent but mic audio is present.

Update `ProximityIndicator`:

- Show a bubble for users with either remote mic or remote camera.
- Use camera video when present.
- Show initials and speaking ring when only mic exists.
- Show a compact screen-share preview when a nearby user has `remoteMedia[userId].screen`.

Update `MediaToolbar` or inline controls:

- Mic button calls `toggleMic()`, which pauses/resumes the mic producer.
- Camera button calls `toggleCamera()`, which closes/recreates the camera producer.
- Screen button calls `startScreenShare()` or `stopScreenShare()`, which controls the `screen` producer.

### Phase 2G: Active speaker and audio-level UI

Required POC approach: client-side audio-level UI.

Reason:

- The frontend already has Web Audio analyser logic in `VideoTile`.
- Client-side analysis works with only the streams each user is allowed to consume.
- It avoids adding server-side audio observation before the SFU media path is stable.

Refactor plan:

1. Move analyser logic out of `VideoTile` into `src/core/services/media/audio-level.service.ts`.
2. Track one analyser per remote `mic` stream.
3. Publish levels into `mediaStore`:

```ts
audioLevels: Record<string, number>;
speakingUsers: string[];
```

4. Use a threshold and hold time:

```text
speaking if smoothedLevel >= 20
stop speaking only after 300 ms below threshold
```

5. Render speaking state in `VideoTile`, `MeetingOverlay`, and `ProximityIndicator`.
6. Clean up analysers when `mic` consumers close.

Optional server-side extension after the POC UI works:

- Add one Mediasoup `AudioLevelObserver` per office router.
- Observe only `mic` producers.
- Emit `sfu:active-speakers` to office members at most twice per second.
- Use it only for debug or meeting-wide ordering; do not depend on it for local playback.

### Phase 2H: Admin/debug endpoint for SFU state

Add an authenticated Socket.IO debug request instead of a public HTTP endpoint for the POC. This avoids exposing process-local SFU state over unauthenticated routes.

Event:

```text
sfu:get-office-debug-state
```

Payload:

```ts
{
  officeId?: string;
}
```

Ack response:

```ts
{
  nodeId: string;
  officeId: string;
  routerId: string;
  workerPid: number;
  peerCount: number;
  transportCount: number;
  producerCount: number;
  consumerCount: number;
  peers: Array<{
    userId: string;
    socketId: string;
    hasSendTransport: boolean;
    hasRecvTransport: boolean;
    producers: Array<{
      producerId: string;
      mediaTag: 'mic' | 'camera' | 'screen';
      kind: 'audio' | 'video';
      paused: boolean;
    }>;
    consumerCount: number;
  }>;
}
```

Access rules:

- Require authenticated socket.
- Require `role === 'ORG_ADMIN'`.
- If `officeId` is omitted, use `client.data.officeId`.
- Only return debug state for the office the socket has joined.
- Do not include RTP parameters, DTLS parameters, ICE candidates, JWT claims, or IP addresses in the debug payload.

Frontend debug UI:

- Add a developer-only panel or console command that calls `sfu:get-office-debug-state`.
- Do not show it in the normal user HUD.
- Use it during manual testing to confirm producer and consumer counts.

### Phase 2I: Multi-instance SFU ownership

For the POC, choose office ownership with sticky routing. Do not implement Mediasoup `PipeTransport` yet.

Reason:

- Mediasoup routers, transports, producers, and consumers are process-local.
- The existing Redis state can coordinate ownership, but it cannot move live transports between nodes.
- Sticky routing keeps all sockets for one office on the same realtime/SFU node.

Backend steps:

1. Add config:

```env
SFU_NODE_ID=local-dev
SFU_OFFICE_OWNER_TTL_SECONDS=30
SFU_OFFICE_OWNER_HEARTBEAT_SECONDS=10
```

2. Add Redis keys:

```text
sfu:office:{officeId}:owner -> nodeId
sfu:node:{nodeId}:heartbeat -> ISO timestamp
```

3. When creating an office SFU room, acquire ownership:

```text
SET sfu:office:{officeId}:owner {nodeId} NX EX 30
```

4. If the key already exists with this node id, refresh the TTL.
5. If the key exists with another node id, reject SFU setup with a structured `OFFICE_OWNED_BY_OTHER_NODE` error.
6. Refresh ownership while the room has peers.
7. Release ownership when the room has no peers.
8. If a node dies, ownership expires and a new node can acquire the office after TTL.

Deployment rule:

- Configure the load balancer so all sockets for the same office land on the same `SFU_NODE_ID`.
- If that cannot be guaranteed, defer horizontal SFU scaling until `PipeTransport` routing is designed and tested.

Future `PipeTransport` plan:

- Add only when users in the same office must be split across SFU nodes.
- Create one router per office per node.
- Pipe producers between office routers on demand.
- Keep the same `sfu:new-consumer` contract at the browser edge.

### Phase 2J: Production observability dashboards

Add structured metrics before calling the POC complete.

Recommended backend dependency:

```powershell
npm install prom-client
```

Metrics to expose:

```text
sfu_workers_total
sfu_office_rooms
sfu_peers
sfu_transports{direction}
sfu_producers{mediaTag,kind}
sfu_consumers{mediaTag,kind}
sfu_consumers_created_total{mediaTag}
sfu_consumers_closed_total{mediaTag,reason}
sfu_reconcile_duration_ms
sfu_reconcile_runs_total
sfu_transport_failures_total{direction}
sfu_worker_died_total
sfu_office_owner_conflicts_total
```

Expose metrics at:

```text
GET /metrics
```

Access options:

- Local development: open endpoint.
- Shared or production environment: protect with network policy, gateway auth, or a metrics scrape token.

Dashboard panels:

- Active offices and peers.
- Producers by `mediaTag`.
- Consumers by `mediaTag`.
- Consumer create/close rate by reason.
- Reconcile duration p50/p95/p99.
- Transport failure count.
- Worker death count.
- Office ownership conflicts.
- Top offices by consumer count.

Logging:

- Log producer create/close with `officeId`, `userId`, `mediaTag`, and `producerId`.
- Log consumer create/close with `officeId`, `receiverUserId`, `remoteUserId`, `mediaTag`, and close reason.
- Log office ownership conflicts.
- Do not log RTP parameters, DTLS parameters, ICE candidates, tokens, or raw SDP-like payloads.

### Phase 2K: Tests

Backend tests:

- `sfu:produce` accepts `mic`, `camera`, and `screen` with valid kind/tag combinations.
- `sfu:produce` rejects `camera` with `kind: 'audio'`.
- `sfu:produce` rejects `mic` with `kind: 'video'`.
- Producing a new `camera` closes the old camera producer and its consumers.
- Closing a `screen` producer emits `screenshare:stop`.
- Creating a `screen` producer emits `screenshare:start`.
- Spatial reconciliation creates `mic`, `camera`, and `screen` consumers for eligible receivers.
- Spatial reconciliation closes all three media tags when a receiver leaves range.
- Meeting override creates all available media consumers for participants in the same meeting zone.
- Debug state returns counts and omits sensitive transport details.
- Non-admin users cannot request debug state.
- Office ownership rejects setup on the wrong node.
- Metrics counters increment on producer creation, consumer creation, and consumer closure.

Frontend tests:

- `media.store` can store and remove `mic`, `camera`, and `screen` independently for the same user.
- Closing a remote `camera` stream does not remove that user's `mic`.
- Closing a remote `screen` stream removes the user from `screenSharingUsers`.
- `SFUManager.handleNewConsumer()` routes each `mediaTag` to the correct store field.
- `SFUManager.handleConsumerClosed()` cleans only the matching tag.
- `toggleMic()` pauses/resumes the mic producer and emits `media:state`.
- `toggleCamera()` closes/recreates the camera producer and emits `media:state`.
- `startScreenShare()` produces `screen` and handles the track `ended` event.
- `VideoTile` renders video from `videoStream` and speaking state from `audioStream`.
- `ProximitySystem` still adjusts only mic volume and never closes video or screen consumers.

Manual POC checks:

1. Two users within 300 px can hear each other and see camera video.
2. Two users outside 300 px cannot hear or see each other's camera.
3. Mic volume fades smoothly inside the radius while camera visibility remains server-routed.
4. Camera off removes remote video but keeps remote mic if mic is still on.
5. Camera on recreates the camera producer and remote camera tile returns.
6. Screen share start creates a featured screen tile for eligible receivers.
7. Screen share stop removes only the screen tile and leaves mic/camera intact.
8. Browser native "Stop sharing" performs the same cleanup as the app button.
9. Same meeting zone receives mic, camera, and screen regardless of distance inside the zone.
10. Leaving a meeting closes meeting-only consumers unless users remain eligible by open-office proximity.
11. Debug state shows expected producer and consumer counts while users move, toggle camera, and share screen.
12. Metrics reflect producer and consumer lifecycle changes.

## End-to-End Migration Order

Phase 1: audio SFU foundation

1. Add backend Mediasoup dependency and env configuration.
2. Add `SfuModule`, `MediasoupService`, and core resource lifecycle.
3. Add `SfuGateway` request handlers with ack responses.
4. Add `SpatialAudioService` and unit-test its policy without real Mediasoup networking.
5. Integrate spatial reconciliation into `OfficeGateway`.
6. Verify backend build and unit tests.
7. Add frontend `mediasoup-client`.
8. Add `SocketService.request()` and SFU socket types.
9. Build `SFUManager` and audio handler.
10. Replace `WebRTCManager` usage in `GameContainer`, `ProximitySystem`, `MeetingSystem`, `NetworkManager`, and `media.store`.
11. Disable/hide video and screen-share UI for this audio-only phase.
12. Remove old frontend P2P imports and `signal:*` event usage.
13. Run frontend build and lint.
14. Run two-user manual tests for proximity, volume fade, meeting override, exit, and refresh cleanup.
15. Remove or archive `SignalingGateway` once the frontend no longer emits or listens for `signal:*`.

Phase 2: full POC media and operations

1. Add VP8 router codec and tagged producer/consumer data model.
2. Extend `sfu:produce`, `sfu:new-consumer`, and `sfu:consumer-closed` with `mediaTag`.
3. Add `sfu:close-producer`, `sfu:pause-producer`, and `sfu:resume-producer`.
4. Update spatial reconciliation to iterate every producer tag.
5. Add screen-share start/stop broadcasts from SFU producer lifecycle.
6. Refactor frontend media store from `remoteStreams` to tagged `remoteMedia`.
7. Refactor `SFUManager` to manage producers and consumers by `mediaTag`.
8. Restore mic, camera, and screen-share controls through SFU producer APIs.
9. Refactor `VideoTile`, `MeetingOverlay`, and `ProximityIndicator` for separate mic, camera, and screen streams.
10. Add client-side audio-level service and speaking indicators.
11. Add admin-only `sfu:get-office-debug-state`.
12. Add Redis-backed office ownership with sticky routing assumptions.
13. Add metrics collection and `/metrics` exposure.
14. Run backend and frontend test suites.
15. Run full manual POC checks for audio, camera, screen share, debug state, and metrics.

## Deployment and Scaling Notes

- Phase 1 assumes one realtime/SFU process owns a given office.
- Phase 2 adds explicit Redis-backed office ownership and requires sticky routing by office.
- If `aura-realtime` scales horizontally without sticky routing, sockets for the same office must use Mediasoup `PipeTransport` between routers. That is not part of this POC.
- The existing Socket.IO Redis adapter is not enough for SFU media routing because Mediasoup transports, producers, and consumers are process-local.
- The SFU is embedded inside `aura-realtime`, not a separate service. This means you deploy two backend services: `aura-api` (stateless REST) and `aura-realtime` (stateful Socket.IO + Mediasoup). This is correct for the POC and initial production. Extract the SFU into a dedicated `aura-sfu` microservice only when you need to scale beyond what a single `aura-realtime` node can handle.
- Production needs:
  - Open UDP port range `40000–49999` for Mediasoup WebRTC transports.
  - Correct `MEDIASOUP_ANNOUNCED_IP` set to the server's public IP, not `127.0.0.1`.
  - TURN server (e.g. self-hosted `coturn`) for clients behind symmetric NATs and corporate firewalls. Mandatory for multi-company deployments.
  - Process supervision that restarts the realtime app if a Mediasoup worker replacement fails.
  - Metrics for worker count, router count, transport count, producer count, consumer count, reconciliation timing, close reasons, and office ownership conflicts.
  - Health check endpoint (`GET /health`) exposing worker count, active rooms, active peers, and dependency status.
  - `MEDIASOUP_WORKER_COUNT` set to the number of available CPU cores (one worker per core).
  - Do not use Alpine Linux for production — musl libc can cause Mediasoup worker crashes. Use Debian Bookworm or Ubuntu 22.04.
- See `docs/devops-deployment-guide.md` for full deployment and operations documentation.

## Acceptance Criteria

Phase 1 backend:

- One router exists per active office.
- Each media-enabled user has one send and one recv WebRTC transport.
- Producing microphone audio triggers spatial reconciliation.
- Movement inside 300 px creates consumers.
- Movement outside 300 px closes consumers.
- Same meeting zone creates consumers regardless of distance.
- Different meeting zones do not connect.
- Disconnect closes all owned SFU resources and informs remaining clients.

Phase 1 frontend:

- No `RTCPeerConnection` or `signal:*` logic remains in active media code.
- `SFUManager` loads a Mediasoup `Device` with backend router RTP capabilities.
- Local microphone audio is produced through the send transport.
- Remote consumers create audio-only `MediaStream` objects and HTML audio elements.
- `ProximitySystem` only adjusts volume.
- Meeting participants play at full volume.
- Leaving range or leaving a meeting cleans up remote streams.

Phase 1 manual:

- Two users can hear each other within 300 px.
- Two users cannot hear each other outside 300 px unless in the same meeting zone.
- Audio volume fades smoothly inside the 300 px radius.
- Refreshing or closing a tab does not leave stale audio.

Full POC Phase 2 backend:

- Router supports Opus and VP8.
- Users can produce `mic`, `camera`, and `screen` on the same send transport.
- Producers and consumers are tracked by `mediaTag`.
- Spatial reconciliation creates and closes consumers for mic, camera, and screen using the same eligibility policy.
- Screen-share lifecycle emits `screenshare:start` and `screenshare:stop`.
- Admin-only debug state reports room, peer, transport, producer, and consumer counts without sensitive transport details.
- Office ownership prevents the same office from being split across SFU nodes in sticky-routing deployments.
- Metrics expose workers, rooms, peers, transports, producers, consumers, reconcile timing, close reasons, and ownership conflicts.

Full POC Phase 2 frontend:

- Media store tracks `mic`, `camera`, and `screen` independently for each remote user.
- Mic mute pauses or resumes the mic producer and keeps volume fading behavior intact.
- Camera toggle closes and recreates the camera producer without affecting mic.
- Screen share creates and closes a `screen` producer without affecting mic or camera.
- `VideoTile` can render video from one stream while reading speaking levels from a separate mic stream.
- Meeting overlay and proximity UI render camera and screen-share streams from tagged remote media.
- Active speaker UI updates from client-side audio-level analysis.

Full POC Phase 2 manual:

- Users within 300 px can hear and see each other.
- Users outside 300 px cannot hear or see each other unless they are in the same meeting zone.
- Meeting participants receive mic, camera, and screen share regardless of distance inside that meeting.
- Camera off/on updates remote UI without tearing down mic audio.
- Screen share start/stop updates remote UI without tearing down mic or camera.
- Refreshing a tab closes all tagged producers and consumers cleanly.
- Debug state and metrics reflect expected SFU state during movement, camera toggles, and screen sharing.
