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

const MIC_MEDIA_TAG: SfuMediaTag = 'mic';

export class SFUManager {
  private device: Device | null = null;
  private sendTransport: SfuTransport | null = null;
  private recvTransport: SfuTransport | null = null;
  private micProducer: SfuProducer | null = null;
  private initializePromise: Promise<void> | null = null;
  private readonly consumers = new Map<string, SfuConsumer>();
  private readonly consumerIdsByRemoteUser = new Map<string, string>();
  private readonly audioHandler = new SfuAudioHandler();

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
    this.micProducer?.close();

    console.log('[SFUManager] producing track...');
    this.micProducer = await sendTransport.produce({
      track,
      appData: { mediaTag: MIC_MEDIA_TAG },
      stopTracks: false,
    });
    console.log('[SFUManager] micProducer created:', this.micProducer.id);
  }

  async handleNewConsumer(payload: SfuNewConsumerPayload): Promise<void> {
    if (payload.mediaTag !== MIC_MEDIA_TAG || payload.kind !== 'audio') {
      return;
    }

    await this.initialize();
    const recvTransport = await this.ensureRecvTransport();
    const existingConsumerId = this.consumerIdsByRemoteUser.get(
      payload.remoteUserId,
    );

    if (existingConsumerId) {
      this.closeConsumer(existingConsumerId, payload.remoteUserId);
    }

    const consumer = await recvTransport.consume({
      id: payload.consumerId,
      producerId: payload.producerId,
      kind: payload.kind,
      rtpParameters: payload.rtpParameters as mediasoupTypes.RtpParameters,
      appData: { mediaTag: payload.mediaTag, remoteUserId: payload.remoteUserId },
    });

    this.consumers.set(payload.consumerId, consumer);
    this.consumerIdsByRemoteUser.set(payload.remoteUserId, payload.consumerId);

    const stream = new MediaStream([consumer.track]);
    this.audioHandler.setupAudioPlayback(payload.remoteUserId, stream);
    useMediaStore.getState().addRemoteStream(payload.remoteUserId, stream);

    await socketService.request('sfu:resume-consumer', {
      consumerId: payload.consumerId,
    });
  }

  handleConsumerClosed(payload: SfuConsumerClosedPayload): void {
    if (payload.mediaTag !== MIC_MEDIA_TAG) {
      return;
    }

    const remoteUserId = payload.remoteUserId ?? this.findRemoteUserId(
      payload.consumerId,
    );

    this.closeConsumer(payload.consumerId, remoteUserId);
  }

  setAudioVolume(userId: string, volume: number): void {
    this.audioHandler.setAudioVolume(userId, volume);
  }

  destroy(): void {
    this.micProducer?.close();
    this.micProducer = null;

    for (const consumerId of this.consumers.keys()) {
      this.closeConsumer(consumerId);
    }

    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
    this.device = null;
    this.initializePromise = null;
    this.audioHandler.destroy();
  }

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
      if (kind !== 'audio') {
        errback(new Error('Only audio producers are supported in Phase 1.'));
        return;
      }

      socketService
        .request('sfu:produce', {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData: {
            mediaTag:
              appData.mediaTag === MIC_MEDIA_TAG ? MIC_MEDIA_TAG : undefined,
          },
        })
        .then(({ producerId }) => callback({ id: producerId }))
        .catch((error: Error) => errback(error));
    });

    this.sendTransport = transport;
    return transport;
  }

  private async ensureRecvTransport(): Promise<SfuTransport> {
    if (this.recvTransport && !this.recvTransport.closed) {
      return this.recvTransport;
    }

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
  }

  private closeConsumer(consumerId: string, remoteUserId?: string): void {
    const consumer = this.consumers.get(consumerId);
    if (consumer && !consumer.closed) {
      consumer.close();
    }

    this.consumers.delete(consumerId);

    if (remoteUserId) {
      this.consumerIdsByRemoteUser.delete(remoteUserId);
      this.audioHandler.cleanupAudioPlayback(remoteUserId);
      useMediaStore.getState().removeRemoteStream(remoteUserId);
      return;
    }

    for (const [userId, storedConsumerId] of this.consumerIdsByRemoteUser) {
      if (storedConsumerId === consumerId) {
        this.consumerIdsByRemoteUser.delete(userId);
        this.audioHandler.cleanupAudioPlayback(userId);
        useMediaStore.getState().removeRemoteStream(userId);
        return;
      }
    }
  }

  private findRemoteUserId(consumerId: string): string | undefined {
    for (const [remoteUserId, storedConsumerId] of this.consumerIdsByRemoteUser) {
      if (storedConsumerId === consumerId) {
        return remoteUserId;
      }
    }

    return undefined;
  }

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
