import { socketService } from './socket.service';
import { useMediaStore } from '../store/media.store';
import { useGameStore } from '../store/game.store';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export class WebRTCManager {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;

  // Audio playback via <audio> elements (reliable for remote WebRTC streams)
  private audioElements: Map<string, HTMLAudioElement> = new Map();

  // Buffer ICE candidates that arrive before the remote description is set
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  // Locks to prevent React Strict Mode duplicate events (Async Race Conditions)
  private offerLocks: Set<string> = new Set();
  private answerLocks: Set<string> = new Set();

  public setLocalStream(stream: MediaStream | null): void {
    console.log('[WebRTCManager] Local stream set:', stream ? 'Active' : 'Null');
    this.localStream = stream;

    // Safety net: add tracks to any peer connections that were created
    // before the local stream was available (e.g. during a race condition).
    if (stream) {
      const peersNeedingRenegotiation: Array<[string, RTCPeerConnection]> = [];

      for (const [userId, peer] of this.peers) {
        const senders = peer.getSenders();
        const hasAudio = senders.some(s => s.track?.kind === 'audio');
        const hasVideo = senders.some(s => s.track?.kind === 'video');
        let tracksAdded = false;

        stream.getTracks().forEach(track => {
          const alreadyAdded = (track.kind === 'audio' && hasAudio) || (track.kind === 'video' && hasVideo);
          if (!alreadyAdded) {
            console.log(`[WebRTCManager] Late-adding ${track.kind} track to peer ${userId}`);
            peer.addTrack(track, stream);
            tracksAdded = true;
          }
        });

        if (tracksAdded) {
          peersNeedingRenegotiation.push([userId, peer]);
        }
      }

      // Renegotiate only the peers that actually received new tracks
      for (const [userId, peer] of peersNeedingRenegotiation) {
        this.renegotiate(userId, peer);
      }
    }
  }

  private async renegotiate(userId: string, peer: RTCPeerConnection): Promise<void> {
    try {
      console.log(`[WebRTCManager] Renegotiating with peer ${userId} after late track addition`);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketService.emit('signal:offer', { targetUserId: userId, offer });
    } catch (error) {
      console.error('[WebRTCManager] Error during renegotiation:', error);
    }
  }

  public async connectToPeer(targetUserId: string): Promise<void> {
    if (this.peers.has(targetUserId)) return;

    const localUserId = useGameStore.getState().localPlayerId;
    
    // Deterministic tie-breaker to prevent Glare
    if (localUserId && localUserId < targetUserId) {
      return; 
    }
    
    console.log('[WebRTCManager] Initiating connection to', targetUserId);
    const peer = this.createPeerConnection(targetUserId);
    
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketService.emit('signal:offer', { targetUserId, offer });
    } catch (error) {
      console.error('[WebRTCManager] Error creating offer:', error);
    }
  }

  public async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    // Debounce Lock to kill duplicate Strict Mode events
    if (this.offerLocks.has(fromUserId)) return;
    this.offerLocks.add(fromUserId);

    console.log('[WebRTCManager] Received offer from', fromUserId);
    
    let peer = this.peers.get(fromUserId);
    if (!peer) {
      peer = this.createPeerConnection(fromUserId);
    }
    
    try {
      // Glare rollback: if we already sent our own offer, roll it back before applying the incoming one
      if (peer.signalingState === 'have-local-offer') {
        console.warn(`[WebRTCManager] Glare detected with ${fromUserId}, rolling back local offer`);
        await peer.setLocalDescription({ type: 'rollback' });
      }
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushPendingCandidates(fromUserId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socketService.emit('signal:answer', { targetUserId: fromUserId, answer });
    } catch (error) {
      console.error('[WebRTCManager] Error handling offer:', error);
    } finally {
      // Release lock after 500ms
      setTimeout(() => this.offerLocks.delete(fromUserId), 500);
    }
  }

  public async handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    // Debounce Lock to kill duplicate Strict Mode events
    if (this.answerLocks.has(fromUserId)) return;
    this.answerLocks.add(fromUserId);

    console.log('[WebRTCManager] Received answer from', fromUserId);
    const peer = this.peers.get(fromUserId);
    
    if (peer) {
      try {
        if (peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          await this.flushPendingCandidates(fromUserId);
        } else {
          console.warn(`[WebRTCManager] Ignored answer - state is already ${peer.signalingState}`);
        }
      } catch (error) {
        console.error(`[WebRTCManager] Error setting remote answer:`, error);
      }
    }

    setTimeout(() => this.answerLocks.delete(fromUserId), 500);
  }

  public async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer) return;

    if (peer.remoteDescription) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[WebRTCManager] Error adding ICE candidate');
      }
    } else {
      // Buffer candidates that arrive before the remote description is set
      const queue = this.pendingCandidates.get(fromUserId) ?? [];
      queue.push(candidate);
      this.pendingCandidates.set(fromUserId, queue);
    }
  }

  private async flushPendingCandidates(userId: string): Promise<void> {
    const candidates = this.pendingCandidates.get(userId);
    if (!candidates || candidates.length === 0) return;
    this.pendingCandidates.delete(userId);

    const peer = this.peers.get(userId);
    if (!peer) return;

    console.log(`[WebRTCManager] Flushing ${candidates.length} buffered ICE candidates for ${userId}`);
    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[WebRTCManager] Error flushing buffered ICE candidate');
      }
    }
  }

  private createPeerConnection(userId: string): RTCPeerConnection {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    this.peers.set(userId, peer);

    // Add local tracks to the peer connection
    const stream = this.localStream;
    if (stream !== null && typeof stream === 'object' && typeof stream.getTracks === 'function') {
      try {
        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });
      } catch (error) {
        console.warn('[WebRTCManager] Could not add tracks to peer:', error);
      }
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.emit('signal:ice-candidate', { targetUserId: userId, candidate: event.candidate });
      }
    };

    peer.ontrack = (event) => {
      console.log('[WebRTCManager] Remote track received from', userId);
      const remoteStream = event.streams[0];
      if (remoteStream) {
        useMediaStore.getState().addRemoteStream(userId, remoteStream);
        this.setupAudioPlayback(userId, remoteStream);
      }
    };

    peer.onconnectionstatechange = () => {
      console.log(`[WebRTCManager] Peer ${userId} connection state: ${peer.connectionState}`);
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed' || peer.connectionState === 'closed') {
        this.disconnectPeer(userId);
      }
    };

    return peer;
  }

  // ─── Audio Playback via <audio> Elements ───
  // Using HTMLAudioElement is the reliable way to play remote WebRTC audio.
  // Chrome's Web Audio API (createMediaStreamSource) has a known issue where
  // remote WebRTC streams don't produce audible output through the AudioContext pipeline.

  private setupAudioPlayback(userId: string, stream: MediaStream): void {
    // Tear down any existing element for this user
    this.cleanupAudioPlayback(userId);

    const audioElement = new Audio();
    audioElement.srcObject = stream;
    audioElement.autoplay = true;
    audioElement.volume = 1.0;

    // Play returns a promise; handle autoplay failures gracefully
    audioElement.play().catch(() => {
      console.warn(`[WebRTCManager] Autoplay blocked for ${userId}. Audio will start on first user interaction.`);
      // Resume on next user interaction
      const playOnInteraction = () => {
        audioElement.play().catch(() => { /* still blocked, ignore */ });
        window.removeEventListener('click', playOnInteraction);
        window.removeEventListener('keydown', playOnInteraction);
      };
      window.addEventListener('click', playOnInteraction);
      window.addEventListener('keydown', playOnInteraction);
    });

    this.audioElements.set(userId, audioElement);
    console.log(`[WebRTCManager] Audio playback started for ${userId}`);
  }

  private cleanupAudioPlayback(userId: string): void {
    const audioElement = this.audioElements.get(userId);
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      this.audioElements.delete(userId);
    }
  }

  public setAudioVolume(userId: string, volume: number): void {
    const audioElement = this.audioElements.get(userId);
    if (audioElement) {
      audioElement.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public disconnectPeer(userId: string): void {
    const peer = this.peers.get(userId);
    if (peer) {
      peer.close();
      this.peers.delete(userId);
      console.log('[WebRTCManager] Disconnected peer', userId);
    }
    
    this.cleanupAudioPlayback(userId);
    this.pendingCandidates.delete(userId);
    useMediaStore.getState().removeRemoteStream(userId);
  }

  public disconnectAll(): void {
    const peerIds = [...this.peers.keys()];
    for (const userId of peerIds) {
      this.disconnectPeer(userId);
    }
  }
}

export const webRTCManager = new WebRTCManager();