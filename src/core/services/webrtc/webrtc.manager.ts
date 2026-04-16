import { useMediaStore } from '../../store/media.store';
import { useGameStore } from '../../store/game.store';
import { PeerConnection } from './peer-connection';
import { MediaHandler } from './media-handler';

/**
 * Top-level manager handling all WebRTC connections.
 * Serves as the API interface for the store and spatial systems.
 */
export class WebRTCManager {
  private connections: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private mediaHandler = new MediaHandler();

  public setLocalStream(stream: MediaStream | null): void {
    console.log('[WebRTCManager] Local stream set:', stream ? 'Active' : 'Null');
    this.localStream = stream;

    // Safety net: add tracks to any peer connections that were created
    // before the local stream was available.
    if (stream) {
      for (const [userId, peer] of this.connections) {
        stream.getTracks().forEach((track) => {
          const senders = peer.rtcPeerConnection.getSenders();
          const alreadySending = senders.some(s => s.track?.kind === track.kind);
          
          if (!alreadySending) {
            // Find existing transceivers without tracks and hook them up
            const transceiver = peer.rtcPeerConnection.getTransceivers()
              .find(t => t.sender.track === null && t.receiver.track?.kind === track.kind);
            
            if (transceiver) {
              console.log(`[WebRTCManager] Late-attaching ${track.kind} to ${userId}`);
              transceiver.sender.replaceTrack(track);
              // Make sure direction is updated
              if (transceiver.direction === 'recvonly') {
                transceiver.direction = 'sendrecv';
              }
            } else {
              // Fallback to adding new track if transceiver missing
               peer.rtcPeerConnection.addTrack(track, stream);
            }
          }
        });
      }
    }
  }

  public connectToPeer(targetUserId: string): void {
    if (this.connections.has(targetUserId)) return;
    
    const localUserId = useGameStore.getState().localPlayerId;
    if (!localUserId) return;

    console.log('[WebRTCManager] Initiating connection to', targetUserId);
    
    // In perfect negotiation, the "polite" peer steps out of the way for glare.
    // Determine politeness by comparing IDs.
    const polite = localUserId > targetUserId;

    const connection = new PeerConnection({
      localUserId,
      remoteUserId: targetUserId,
      polite,
      localStream: this.localStream,
      onTrack: (stream) => {
        console.log('[WebRTCManager] Remote track received from', targetUserId);
        useMediaStore.getState().addRemoteStream(targetUserId, stream);
        this.mediaHandler.setupAudioPlayback(targetUserId, stream);
      },
      onDisconnect: () => {
        this.disconnectPeer(targetUserId);
      }
    });

    this.connections.set(targetUserId, connection);
    
    // Note: PeerConnection triggers 'onnegotiationneeded' natively after setup,
    // which broadcasts the first createOffer().
  }

  public async handleOffer(fromUserId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    let connection = this.connections.get(fromUserId);
    
    // If the remote peer initiated first, establish connection wrapper tracking
    if (!connection) {
      const localUserId = useGameStore.getState().localPlayerId!;
      connection = new PeerConnection({
        localUserId,
        remoteUserId: fromUserId,
        polite: localUserId > fromUserId, 
        localStream: this.localStream,
        onTrack: (stream) => {
          useMediaStore.getState().addRemoteStream(fromUserId, stream);
          this.mediaHandler.setupAudioPlayback(fromUserId, stream);
        },
        onDisconnect: () => {
          this.disconnectPeer(fromUserId);
        }
      });
      this.connections.set(fromUserId, connection);
    }

    await connection.handleOffer(offer);
  }

  public async handleAnswer(fromUserId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const connection = this.connections.get(fromUserId);
    if (connection) {
      await connection.handleAnswer(answer);
    }
  }

  public async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const connection = this.connections.get(fromUserId);
    if (connection) {
      await connection.handleIceCandidate(candidate);
    }
  }

  public setAudioVolume(userId: string, volume: number): void {
    this.mediaHandler.setAudioVolume(userId, volume);
  }

  // ─── Screen Share & Camera Toggles ───

  public handleLocalScreenShareStart(screenStream: MediaStream): void {
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) return;
    this.replaceVideoTrackOnPeers(screenTrack);
  }

  public handleLocalScreenShareStop(localStream: MediaStream | null): void {
    const cameraTrack = localStream?.getVideoTracks()[0] ?? null;
    this.replaceVideoTrackOnPeers(cameraTrack);
  }

  public replaceVideoTrackOnPeers(track: MediaStreamTrack | null): void {
    for (const [userId, connection] of this.connections) {
      if (connection.videoSender) {
        try {
          connection.videoSender.replaceTrack(track);
          console.log(`[WebRTCManager] Replaced video track for peer: ${userId}`);
        } catch (err) {
          console.error(`[WebRTCManager] replaceTrack failed for ${userId}:`, err);
        }
      }
    }
  }

  public disconnectPeer(userId: string): void {
    const connection = this.connections.get(userId);
    if (connection) {
      connection.close();
      this.connections.delete(userId);
      console.log('[WebRTCManager] Disconnected peer', userId);
    }
    
    this.mediaHandler.cleanupAudioPlayback(userId);
    useMediaStore.getState().removeRemoteStream(userId);
  }

  public disconnectAll(): void {
    const peerIds = [...this.connections.keys()];
    for (const userId of peerIds) {
      this.disconnectPeer(userId);
    }
  }
}

export const webRTCManager = new WebRTCManager();
