import { Device, types as mediasoupTypes } from 'mediasoup-client';

import { socketService } from '@core/services/socket.service';
import { useMediaStore } from '@core/store/media.store';
import type {
  SfuConsumerClosedPayload,
  SfuMediaTag,
  SfuNewConsumerPayload,
  SfuTransportParameters,
} from '@core/types';

import { SfuAudioHandler } from './sfu-audio-handler';

type SfuTransport = mediasoupTypes.Transport;
type SfuProducer = mediasoupTypes.Producer;
type SfuConsumer = mediasoupTypes.Consumer;

/** Camera simulcast encodings: low (~180p), medium (~360p), high (~720p) */
const CAMERA_SIMULCAST_ENCODINGS: mediasoupTypes.RtpEncodingParameters[] = [
  { maxBitrate: 100_000, scaleResolutionDownBy: 4 },
  { maxBitrate: 300_000, scaleResolutionDownBy: 2 },
  { maxBitrate: 900_000 },
];

/** Screen share — no simulcast, full resolution */
const SCREEN_ENCODING: mediasoupTypes.RtpEncodingParameters[] = [
  { maxBitrate: 2_000_000 },
];

function getUserTagKey(userId: string, mediaTag: SfuMediaTag): string {
  return `${userId}:${mediaTag}`;
}

export class SFUManager {
  private device: Device | null = null;
  private sendTransport: SfuTransport | null = null;
  private recvTransport: SfuTransport | null = null;
  private initializePromise: Promise<void> | null = null;
  private ensureSendTransportPromise: Promise<SfuTransport> | null = null;
  private ensureRecvTransportPromise: Promise<SfuTransport> | null = null;
  private readonly producersByTag = new Map<SfuMediaTag, SfuProducer>();
  private readonly consumersById = new Map<string, SfuConsumer>();
  private readonly consumersByUserAndTag = new Map<string, SfuConsumer>();
  private readonly audioHandler = new SfuAudioHandler();

  // ─── Initialization ───

  async initialize(): Promise<void> {
    if (this.device?.loaded && this.recvTransport) {
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      await this.loadDevice();
      await this.ensureRecvTransport();
    })().finally(() => {
      this.initializePromise = null;
    });

    return this.initializePromise;
  }

  // ─── Mic Producer ───

  async startMicProducer(track: MediaStreamTrack): Promise<void> {
    console.log('[SFUManager] startMicProducer called with track:', track);
    await this.initialize();
    console.log('[SFUManager] initialized successfully');

    if (!this.device?.canProduce('audio')) {
      console.error('[SFUManager] This browser cannot produce SFU audio.');
      throw new Error('This browser cannot produce SFU audio.');
    }

    console.log('[SFUManager] ensureSendTransport...');
    const sendTransport = await this.ensureSendTransport();

    // Close existing mic producer if any
    const existingMic = this.producersByTag.get('mic');
    if (existingMic && !existingMic.closed) {
      existingMic.close();
    }

    console.log('[SFUManager] producing mic track...');
    const producer = await sendTransport.produce({
      track,
      appData: { mediaTag: 'mic' as SfuMediaTag },
      stopTracks: false,
    });

    this.producersByTag.set('mic', producer);
    console.log('[SFUManager] micProducer created:', producer.id);
  }

  async pauseMicProducer(): Promise<void> {
    const producer = this.producersByTag.get('mic');
    if (!producer || producer.closed) return;

    await socketService.request('sfu:pause-producer', { mediaTag: 'mic' });
    producer.pause();
    console.log('[SFUManager] Mic producer paused');
  }

  async resumeMicProducer(): Promise<void> {
    const producer = this.producersByTag.get('mic');
    if (!producer || producer.closed) return;

    await socketService.request('sfu:resume-producer', { mediaTag: 'mic' });
    producer.resume();
    console.log('[SFUManager] Mic producer resumed');
  }

  // ─── Camera Producer ───

  async startCameraProducer(track: MediaStreamTrack): Promise<void> {
    console.log('[SFUManager] startCameraProducer called');
    await this.initialize();

    if (!this.device?.canProduce('video')) {
      console.error('[SFUManager] This browser cannot produce SFU video.');
      throw new Error('This browser cannot produce SFU video.');
    }

    const sendTransport = await this.ensureSendTransport();

    // Close existing camera producer if any
    const existingCamera = this.producersByTag.get('camera');
    if (existingCamera && !existingCamera.closed) {
      existingCamera.close();
    }

    const producer = await sendTransport.produce({
      track,
      encodings: CAMERA_SIMULCAST_ENCODINGS,
      codecOptions: { videoGoogleStartBitrate: 300 },
      appData: { mediaTag: 'camera' as SfuMediaTag },
      stopTracks: false,
    });

    this.producersByTag.set('camera', producer);
    console.log('[SFUManager] cameraProducer created:', producer.id);
  }

  async stopCameraProducer(): Promise<void> {
    await this.closeProducer('camera');
  }

  // ─── Screen Share Producer ───

  async startScreenShareProducer(track: MediaStreamTrack): Promise<void> {
    console.log('[SFUManager] startScreenShareProducer called');
    await this.initialize();

    if (!this.device?.canProduce('video')) {
      console.error('[SFUManager] This browser cannot produce SFU video.');
      throw new Error('This browser cannot produce SFU video.');
    }

    const sendTransport = await this.ensureSendTransport();

    // Close existing screen producer if any
    const existingScreen = this.producersByTag.get('screen');
    if (existingScreen && !existingScreen.closed) {
      existingScreen.close();
    }

    const producer = await sendTransport.produce({
      track,
      encodings: SCREEN_ENCODING,
      appData: { mediaTag: 'screen' as SfuMediaTag },
      stopTracks: false,
    });

    this.producersByTag.set('screen', producer);
    console.log('[SFUManager] screenProducer created:', producer.id);

    // Auto-stop when browser native "Stop sharing" is clicked
    track.addEventListener('ended', () => {
      console.log('[SFUManager] Screen track ended (native stop)');
      this.stopScreenShareProducer().catch((err) => {
        console.error('[SFUManager] Failed to auto-stop screen share:', err);
      });
      useMediaStore.getState().stopScreenShare();
    });
  }

  async stopScreenShareProducer(): Promise<void> {
    await this.closeProducer('screen');
  }

  // ─── Generic Producer Close ───

  async closeProducer(mediaTag: SfuMediaTag): Promise<void> {
    const producer = this.producersByTag.get(mediaTag);
    if (!producer) return;

    try {
      await socketService.request('sfu:close-producer', { mediaTag });
    } catch (err) {
      console.warn(`[SFUManager] sfu:close-producer (${mediaTag}) failed:`, err);
    }

    if (!producer.closed) {
      producer.close();
    }
    this.producersByTag.delete(mediaTag);
    console.log(`[SFUManager] Producer closed: ${mediaTag}`);
  }

  // ─── Consumer Handling ───

  async handleNewConsumer(payload: SfuNewConsumerPayload): Promise<void> {
    await this.initialize();
    const recvTransport = await this.ensureRecvTransport();

    const userTagKey = getUserTagKey(payload.remoteUserId, payload.mediaTag);

    // Close existing consumer for this user+tag if any
    const existingConsumer = this.consumersByUserAndTag.get(userTagKey);
    if (existingConsumer) {
      this.closeConsumer(existingConsumer.id, payload.remoteUserId, payload.mediaTag);
    }

    const consumer = await recvTransport.consume({
      id: payload.consumerId,
      producerId: payload.producerId,
      kind: payload.kind,
      rtpParameters: payload.rtpParameters as mediasoupTypes.RtpParameters,
      appData: { mediaTag: payload.mediaTag, remoteUserId: payload.remoteUserId },
    });

    this.consumersById.set(payload.consumerId, consumer);
    this.consumersByUserAndTag.set(userTagKey, consumer);

    const stream = new MediaStream([consumer.track]);
    const store = useMediaStore.getState();

    switch (payload.mediaTag) {
      case 'mic':
        this.audioHandler.setupAudioPlayback(payload.remoteUserId, stream);
        store.setRemoteMediaStream(payload.remoteUserId, 'mic', stream);
        break;

      case 'camera':
        store.setRemoteMediaStream(payload.remoteUserId, 'camera', stream);
        break;

      case 'screen':
        store.setRemoteMediaStream(payload.remoteUserId, 'screen', stream);
        store.addScreenSharingUser(payload.remoteUserId);
        break;
    }

    await socketService.request('sfu:resume-consumer', {
      consumerId: payload.consumerId,
    });
  }

  handleConsumerClosed(payload: SfuConsumerClosedPayload): void {
    const remoteUserId = payload.remoteUserId ?? this.findRemoteUserId(payload.consumerId);
    const mediaTag = payload.mediaTag;

    this.closeConsumer(payload.consumerId, remoteUserId, mediaTag);
  }

  // ─── Volume ───

  setAudioVolume(userId: string, volume: number): void {
    this.audioHandler.setAudioVolume(userId, volume);
  }

  // ─── Cleanup ───

  destroy(): void {
    // Close all producers
    for (const [tag, producer] of this.producersByTag) {
      if (!producer.closed) {
        producer.close();
      }
      console.log(`[SFUManager] Closed producer: ${tag}`);
    }
    this.producersByTag.clear();

    // Close all consumers
    for (const consumerId of this.consumersById.keys()) {
      this.closeConsumer(consumerId);
    }

    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
    this.device = null;
    this.initializePromise = null;
    this.ensureSendTransportPromise = null;
    this.ensureRecvTransportPromise = null;
    this.audioHandler.destroy();
  }

  // ─── Private: Device & Transport Setup ───

  private async loadDevice(): Promise<void> {
    console.log('[SFUManager] loadDevice: requesting router RTP capabilities...');
    const response = await socketService.request(
      'sfu:get-router-rtp-capabilities',
      {},
    );
    console.log('[SFUManager] loadDevice: got capabilities:', response);

    const device = new Device();
    await device.load({
      routerRtpCapabilities:
        response.rtpCapabilities as mediasoupTypes.RtpCapabilities,
    });
    console.log('[SFUManager] loadDevice: device loaded');

    this.device = device;

    // --- Register socket listeners ---
    socketService.off('sfu:new-consumer');
    socketService.on('sfu:new-consumer', (payload) => {
      console.log('[SFUManager] Received sfu:new-consumer', payload);
      this.handleNewConsumer(payload).catch((err) => {
        console.error('[SFUManager] Failed to handle new consumer:', err);
      });
    });

    socketService.off('sfu:consumer-closed');
    socketService.on('sfu:consumer-closed', (payload) => {
      console.log('[SFUManager] Received sfu:consumer-closed', payload);
      this.handleConsumerClosed(payload);
    });
  }

  private async ensureSendTransport(): Promise<SfuTransport> {
    if (this.sendTransport && !this.sendTransport.closed) {
      return this.sendTransport;
    }

    if (this.ensureSendTransportPromise) {
      return this.ensureSendTransportPromise;
    }

    this.ensureSendTransportPromise = (async () => {
      const transportParameters = await socketService.request(
        'sfu:create-webrtc-transport',
        { direction: 'send' },
      );

      const transport = this.requireDevice().createSendTransport(
        this.toTransportOptions(transportParameters),
      );

      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socketService
          .request('sfu:connect-transport', {
            transportId: transport.id,
            dtlsParameters,
          })
          .then(() => callback())
          .catch((error: Error) => errback(error));
      });

      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        const mediaTag = (appData?.mediaTag as SfuMediaTag) ?? 'mic';

        socketService
          .request('sfu:produce', {
            transportId: transport.id,
            kind: kind as 'audio' | 'video',
            rtpParameters,
            appData: { mediaTag },
          })
          .then(({ producerId }) => callback({ id: producerId }))
          .catch((error: Error) => errback(error));
      });

      this.sendTransport = transport;
      return transport;
    })().finally(() => {
      this.ensureSendTransportPromise = null;
    });

    return this.ensureSendTransportPromise;
  }

  private async ensureRecvTransport(): Promise<SfuTransport> {
    if (this.recvTransport && !this.recvTransport.closed) {
      return this.recvTransport;
    }

    if (this.ensureRecvTransportPromise) {
      return this.ensureRecvTransportPromise;
    }

    this.ensureRecvTransportPromise = (async () => {
      const device = this.requireDevice();
      const transportParameters = await socketService.request(
        'sfu:create-webrtc-transport',
        {
          direction: 'recv',
          rtpCapabilities: device.rtpCapabilities,
        },
      );

      const transport = device.createRecvTransport(
        this.toTransportOptions(transportParameters),
      );

      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socketService
          .request('sfu:connect-transport', {
            transportId: transport.id,
            dtlsParameters,
          })
          .then(() => callback())
          .catch((error: Error) => errback(error));
      });

      this.recvTransport = transport;
      return transport;
    })().finally(() => {
      this.ensureRecvTransportPromise = null;
    });

    return this.ensureRecvTransportPromise;
  }

  // ─── Private: Consumer Lifecycle ───

  private closeConsumer(consumerId: string, remoteUserId?: string, mediaTag?: SfuMediaTag): void {
    const consumer = this.consumersById.get(consumerId);
    if (consumer && !consumer.closed) {
      consumer.close();
    }

    this.consumersById.delete(consumerId);

    // Resolve remoteUserId and mediaTag from consumer appData if not provided
    const resolvedUserId = remoteUserId ?? (consumer?.appData?.remoteUserId as string | undefined);
    const resolvedTag = mediaTag ?? (consumer?.appData?.mediaTag as SfuMediaTag | undefined);

    if (resolvedUserId && resolvedTag) {
      const userTagKey = getUserTagKey(resolvedUserId, resolvedTag);
      this.consumersByUserAndTag.delete(userTagKey);

      const store = useMediaStore.getState();

      switch (resolvedTag) {
        case 'mic':
          this.audioHandler.cleanupAudioPlayback(resolvedUserId);
          store.removeRemoteMediaStream(resolvedUserId, 'mic');
          break;

        case 'camera':
          store.removeRemoteMediaStream(resolvedUserId, 'camera');
          break;

        case 'screen':
          store.removeRemoteMediaStream(resolvedUserId, 'screen');
          store.removeScreenSharingUser(resolvedUserId);
          break;
      }
      return;
    }

    // Fallback: search for the consumer in the user+tag map
    for (const [key, storedConsumer] of this.consumersByUserAndTag) {
      if (storedConsumer === consumer || storedConsumer.id === consumerId) {
        this.consumersByUserAndTag.delete(key);
        const [userId, tag] = key.split(':') as [string, SfuMediaTag];
        const store = useMediaStore.getState();

        switch (tag) {
          case 'mic':
            this.audioHandler.cleanupAudioPlayback(userId);
            store.removeRemoteMediaStream(userId, 'mic');
            break;
          case 'camera':
            store.removeRemoteMediaStream(userId, 'camera');
            break;
          case 'screen':
            store.removeRemoteMediaStream(userId, 'screen');
            store.removeScreenSharingUser(userId);
            break;
        }
        return;
      }
    }
  }

  private findRemoteUserId(consumerId: string): string | undefined {
    const consumer = this.consumersById.get(consumerId);
    if (consumer?.appData?.remoteUserId) {
      return consumer.appData.remoteUserId as string;
    }

    for (const [key, storedConsumer] of this.consumersByUserAndTag) {
      if (storedConsumer.id === consumerId) {
        return key.split(':')[0];
      }
    }

    return undefined;
  }

  // ─── Private: Helpers ───

  private requireDevice(): Device {
    if (!this.device?.loaded) {
      throw new Error('SFU device has not been initialized.');
    }

    return this.device;
  }

  private toTransportOptions(
    parameters: SfuTransportParameters,
  ): mediasoupTypes.TransportOptions {
    return {
      id: parameters.id,
      iceParameters:
        parameters.iceParameters as mediasoupTypes.IceParameters,
      iceCandidates:
        parameters.iceCandidates as mediasoupTypes.IceCandidate[],
      dtlsParameters:
        parameters.dtlsParameters as mediasoupTypes.DtlsParameters,
      iceServers: parameters.iceServers,
    };
  }
}

export const sfuManager = new SFUManager();
