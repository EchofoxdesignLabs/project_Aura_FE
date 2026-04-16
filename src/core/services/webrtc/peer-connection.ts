import { socketService } from '../socket.service';

export interface PeerConnectionConfig {
  localUserId: string;
  remoteUserId: string;
  polite: boolean; // Perfect negotiation: true if we resolve glare by rolling back, false if we ignore the remote offer
  onTrack: (stream: MediaStream) => void;
  onDisconnect: () => void;
  localStream: MediaStream | null;
}

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export class PeerConnection {
  public rtcPeerConnection: RTCPeerConnection;
  public videoSender: RTCRtpSender | null = null;
  public readonly remoteUserId: string;

  private polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;

  constructor(private config: PeerConnectionConfig) {
    this.remoteUserId = config.remoteUserId;
    this.polite = config.polite;
    
    this.rtcPeerConnection = new RTCPeerConnection(ICE_SERVERS);
    this.setupListeners();
    this.setupTransceivers();
  }

  private setupListeners(): void {
    const pc = this.rtcPeerConnection;

    // Send newly generated ICE candidates to the remote peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.emit('signal:ice-candidate', {
          targetUserId: this.remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    // Negotiation needed ( triggered by addTransceiver or changes )
    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        socketService.emit('signal:offer', { 
          targetUserId: this.remoteUserId, 
          offer: pc.localDescription! 
        });
      } catch (err) {
        console.error(`[PeerConnection] Negotiation failed for ${this.remoteUserId}`, err);
      } finally {
        this.makingOffer = false;
      }
    };

    // Track received
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.config.onTrack(stream);
      } else {
        // Fallback if streams array is empty (unlikely with addTransceiver usage)
        const newStream = new MediaStream([event.track]);
        this.config.onTrack(newStream);
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      console.log(`[PeerConnection] ${this.remoteUserId} state: ${pc.connectionState}`);
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        this.config.onDisconnect();
      }
    };
  }

  private setupTransceivers(): void {
    const stream = this.config.localStream;
    let audioTrack: MediaStreamTrack | undefined;
    let videoTrack: MediaStreamTrack | undefined;

    if (stream) {
      audioTrack = stream.getAudioTracks()[0];
      videoTrack = stream.getVideoTracks()[0];
    }

    const pc = this.rtcPeerConnection;
    const streams = stream ? [stream] : [];

    // Ensure audio transceiver exists
    if (audioTrack) {
      pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams });
    } else {
      pc.addTransceiver('audio', { direction: 'sendrecv', streams });
    }

    // Ensure video transceiver exists and save sender for replaceTrack
    let videoTransceiver: RTCRtpTransceiver;
    if (videoTrack) {
      videoTransceiver = pc.addTransceiver(videoTrack, { direction: 'sendrecv', streams });
    } else {
      videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv', streams });
    }
    
    this.videoSender = videoTransceiver.sender;
  }

  // Handle incoming Offer (Perfect Negotiation logic)
  public async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.rtcPeerConnection;
    
    const offerCollision = this.makingOffer || pc.signalingState !== 'stable';
    this.ignoreOffer = !this.polite && offerCollision;

    if (this.ignoreOffer) {
      console.log(`[PeerConnection] Ignored glare offer from ${this.remoteUserId}`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socketService.emit('signal:answer', {
        targetUserId: this.remoteUserId,
        answer: pc.localDescription!
      });
    } catch (err) {
      console.error(`[PeerConnection] Failed to handle offer from ${this.remoteUserId}`, err);
    }
  }

  // Handle incoming Answer
  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.rtcPeerConnection;
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (err) {
      console.error(`[PeerConnection] Failed to handle answer from ${this.remoteUserId}`, err);
    }
  }

  // Handle incoming ICE Candidate
  public async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.rtcPeerConnection;
    try {
      // The ignoreOffer flag dictates whether to suppress early ICE candidates for the ignored offer
      if (this.ignoreOffer) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      if (!this.ignoreOffer) {
        console.warn(`[PeerConnection] Failed to add ICE candidate for ${this.remoteUserId}`);
      }
    }
  }

  public close(): void {
    this.rtcPeerConnection.close();
  }
}
