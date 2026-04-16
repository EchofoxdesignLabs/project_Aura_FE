import { create } from 'zustand';

interface MediaStoreData {
  localStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isMediaInitialized: boolean;
  remoteStreams: Record<string, MediaStream>;

  // ─── Screen Share ───
  screenStream: MediaStream | null;
  isScreenSharing: boolean;
  screenSharingUsers: string[];

  // ─── Peer State Tracking ───
  peerMediaStates: Record<string, { isMicOn: boolean; isCameraOn: boolean }>;
}

export interface MediaState extends MediaStoreData {
  initMedia: () => Promise<void>;
  stopMedia: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  addRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  clearAllRemoteStreams: () => void;

  // ─── Screen Share ───
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  addScreenSharingUser: (userId: string) => void;
  removeScreenSharingUser: (userId: string) => void;

  // ─── Peer State Tracking ───
  updatePeerMediaState: (userId: string, state: Partial<{ isMicOn: boolean; isCameraOn: boolean }>) => void;
}

function createInitialMediaData(): MediaStoreData {
  return {
    localStream: null,
    isMicOn: false,
    isCameraOn: false,
    isMediaInitialized: false,
    remoteStreams: {},
    screenStream: null,
    isScreenSharing: false,
    screenSharingUsers: [],
    peerMediaStates: {},
  };
}

function stopStreamTracks(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export const useMediaStore = create<MediaState>()((set, get) => ({
  ...createInitialMediaData(),
  initMedia: async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices API is not available in this browser.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    const previousStream = get().localStream;
    if (previousStream && previousStream !== stream) {
      stopStreamTracks(previousStream);
    }

    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];

    set(() => ({
      localStream: stream,
      isMicOn: audioTrack?.enabled ?? false,
      isCameraOn: videoTrack?.enabled ?? false,
      isMediaInitialized: true,
    }));
  },
  stopMedia: () => {
    const { localStream, screenStream } = get();
    stopStreamTracks(localStream);
    stopStreamTracks(screenStream);

    set(() => ({
      localStream: null,
      screenStream: null,
      isScreenSharing: false,
      isMicOn: false,
      isCameraOn: false,
      isMediaInitialized: false,
    }));
  },
  toggleMic: () => {
    const audioTrack = get().localStream?.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    const newState = audioTrack.enabled;
    set(() => ({
      isMicOn: newState,
    }));
    
    // Notify peers that our mic state changed
    import('@core/services/socket.service').then(({ socketService }) => {
      socketService.emit('media:state', { isMicOn: newState, isCameraOn: get().isCameraOn });
    });
  },

  // Camera toggle: actually stops/releases the hardware (LED goes off).
  // When re-enabling, getUserMedia is called again to re-acquire the camera.
  toggleCamera: () => {
    const { localStream, isCameraOn, isMicOn } = get();
    if (!localStream) return;

    if (isCameraOn) {
      // ─── Turn OFF: stop track → release hardware → replace on peers with null ───
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        localStream.removeTrack(videoTrack);
        videoTrack.stop(); // Releases hardware — camera LED goes off
      }
      
      // Clone stream so the local VideoTile receives a fresh reference and updates cleanly
      const clonedStream = new MediaStream(localStream.getTracks());
      
      // Replace video on peers with null (they see black/initials)
      import('@core/services/webrtc/webrtc.manager').then(({ webRTCManager }) => {
        // Must update local store reference too so the UI rebinds and hides the local video
        webRTCManager.setLocalStream(clonedStream);
        webRTCManager.replaceVideoTrackOnPeers(null);
      });
      
      set({ isCameraOn: false, localStream: clonedStream });
      
      import('@core/services/socket.service').then(({ socketService }) => {
        socketService.emit('media:state', { isMicOn, isCameraOn: false });
      });
    } else {
      // ─── Turn ON: re-acquire camera → add to stream → replace on peers ───
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((newStream) => {
          const newVideoTrack = newStream.getVideoTracks()[0];
          const currentStream = get().localStream;
          if (currentStream) {
            currentStream.addTrack(newVideoTrack);
            
            // Clone the stream to force React's useEffect to run correctly and show the local camera!
            const clonedStream = new MediaStream(currentStream.getTracks());
            
            import('@core/services/webrtc/webrtc.manager').then(({ webRTCManager }) => {
              webRTCManager.setLocalStream(clonedStream);
              webRTCManager.replaceVideoTrackOnPeers(newVideoTrack);
            });
            
            set({ isCameraOn: true, localStream: clonedStream });
          } else {
             set({ isCameraOn: true });
          }
          
          import('@core/services/socket.service').then(({ socketService }) => {
            socketService.emit('media:state', { isMicOn, isCameraOn: true });
          });
        })
        .catch((err) => {
          console.warn('[mediaStore] Failed to re-acquire camera:', err);
        });
    }
  },

  addRemoteStream: (userId, stream) => {
    const currentStream = get().remoteStreams[userId];
    if (currentStream === stream) {
      return;
    }

    if (currentStream) {
      stopStreamTracks(currentStream);
    }

    set((state) => ({
      remoteStreams: {
        ...state.remoteStreams,
        [userId]: stream,
      },
    }));
  },
  removeRemoteStream: (userId) => {
    const currentStream = get().remoteStreams[userId];
    if (!currentStream) {
      return;
    }

    stopStreamTracks(currentStream);

    set((state) => {
      const remainingStreams = { ...state.remoteStreams };
      delete remainingStreams[userId];
      return {
        remoteStreams: remainingStreams,
      };
    });
  },
  clearAllRemoteStreams: () => {
    Object.values(get().remoteStreams).forEach((stream) => {
      stopStreamTracks(stream);
    });

    set(() => ({
      remoteStreams: {},
      screenSharingUsers: [],
      peerMediaStates: {},
    }));
  },

  // ─── Peer State Tracking Mutations ───
  updatePeerMediaState: (userId, state) => {
    set((s) => ({
      peerMediaStates: {
        ...s.peerMediaStates,
        [userId]: {
          ...(s.peerMediaStates[userId] || { isMicOn: true, isCameraOn: true }),
          ...state,
        },
      },
    }));
  },

  // ─── Screen Share Actions ───

  startScreenShare: async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: 15,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      // Auto-cleanup when browser's native "Stop sharing" button is clicked
      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.addEventListener('ended', () => {
        get().stopScreenShare();
      });

      set({ screenStream, isScreenSharing: true });

      // Replace camera track with screen track on all peer connections
      const { webRTCManager } = await import('@core/services/webrtc/webrtc.manager');
      webRTCManager.handleLocalScreenShareStart(screenStream);

      // Broadcast to room via socket
      const { socketService } = await import('@core/services/socket.service');
      socketService.emit('screenshare:start', {} as Record<string, never>);

      console.log('[mediaStore] Screen share started');
    } catch (err) {
      // User cancelled the picker — not an error
      console.log('[mediaStore] Screen share cancelled or failed:', err);
    }
  },

  stopScreenShare: () => {
    const { screenStream, localStream } = get();

    // Stop all screen tracks
    screenStream?.getTracks().forEach((t) => t.stop());

    set({ screenStream: null, isScreenSharing: false });

    // Restore camera track on all peer connections
    import('@core/services/webrtc/webrtc.manager').then(({ webRTCManager }) => {
      webRTCManager.handleLocalScreenShareStop(localStream);
    });

    // Notify other users
    import('@core/services/socket.service').then(({ socketService }) => {
      socketService.emit('screenshare:stop', {} as Record<string, never>);
    });

    console.log('[mediaStore] Screen share stopped');
  },

  addScreenSharingUser: (userId) =>
    set((state) => ({
      screenSharingUsers: state.screenSharingUsers.includes(userId)
        ? state.screenSharingUsers
        : [...state.screenSharingUsers, userId],
    })),

  removeScreenSharingUser: (userId) =>
    set((state) => ({
      screenSharingUsers: state.screenSharingUsers.filter((id) => id !== userId),
    })),
}));
