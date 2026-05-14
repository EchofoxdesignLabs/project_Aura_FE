import { create } from 'zustand';

import type { RemoteUserMedia, SfuMediaTag } from '@core/types';

interface MediaStoreData {
  localStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isMediaInitialized: boolean;
  remoteMedia: Record<string, RemoteUserMedia>;
  screenStream: MediaStream | null;
  isScreenSharing: boolean;
  screenSharingUsers: string[];
  peerMediaStates: Record<string, { isMicOn: boolean; isCameraOn: boolean }>;
}

export interface MediaState extends MediaStoreData {
  initMedia: () => Promise<void>;
  stopMedia: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  setRemoteMediaStream: (userId: string, mediaTag: SfuMediaTag, stream: MediaStream) => void;
  removeRemoteMediaStream: (userId: string, mediaTag: SfuMediaTag) => void;
  removeAllRemoteMediaForUser: (userId: string) => void;
  clearAllRemoteMedia: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  addScreenSharingUser: (userId: string) => void;
  removeScreenSharingUser: (userId: string) => void;
  updatePeerMediaState: (
    userId: string,
    state: Partial<{ isMicOn: boolean; isCameraOn: boolean }>,
  ) => void;
}

function createInitialMediaData(): MediaStoreData {
  return {
    localStream: null,
    isMicOn: false,
    isCameraOn: false,
    isMediaInitialized: false,
    remoteMedia: {},
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

function emitMediaState(state: { isMicOn?: boolean; isCameraOn?: boolean }): void {
  import('@core/services/socket.service').then(({ socketService }) => {
    if (socketService.isConnected()) {
      socketService.emit('media:state', state);
    }
  });
}

export const useMediaStore = create<MediaState>()((set, get) => ({
  ...createInitialMediaData(),

  initMedia: async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices API is not available in this browser.');
    }

    let stream: MediaStream | null = null;

    // Try audio + video first
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
    } catch {
      // Camera denied or unavailable — try audio only
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch {
        // Mic also denied — try video only
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        } catch {
          // Both denied — proceed with no media
          console.warn('[mediaStore] All media permissions denied. Office will load without media.');
        }
      }
    }

    const previousStream = get().localStream;
    if (previousStream && previousStream !== stream) {
      stopStreamTracks(previousStream);
    }

    const audioTrack = stream?.getAudioTracks()[0];
    const videoTrack = stream?.getVideoTracks()[0];

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
    const isMicOn = audioTrack.enabled;

    set(() => ({ isMicOn }));
    emitMediaState({ isMicOn, isCameraOn: get().isCameraOn });

    // Pause/resume mic producer on the SFU
    import('@core/services/sfu/sfu.manager').then(({ sfuManager }) => {
      if (isMicOn) {
        sfuManager.resumeMicProducer().catch((err) => {
          console.error('[mediaStore] Failed to resume mic producer:', err);
        });
      } else {
        sfuManager.pauseMicProducer().catch((err) => {
          console.error('[mediaStore] Failed to pause mic producer:', err);
        });
      }
    });
  },

  toggleCamera: () => {
    const { localStream, isCameraOn } = get();

    import('@core/services/sfu/sfu.manager').then(({ sfuManager }) => {
      if (isCameraOn) {
        // Turn camera off — stop the video track and close the camera producer
        const videoTrack = localStream?.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.stop();
          localStream?.removeTrack(videoTrack);
        }

        sfuManager.stopCameraProducer().catch((err) => {
          console.error('[mediaStore] Failed to stop camera producer:', err);
        });

        set(() => ({ isCameraOn: false }));
        emitMediaState({ isMicOn: get().isMicOn, isCameraOn: false });
      } else {
        // Turn camera on — acquire a new video track and start camera producer
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: false })
          .then(async (cameraStream) => {
            const newVideoTrack = cameraStream.getVideoTracks()[0];
            if (!newVideoTrack) return;

            // Add video track to localStream so UI can render self-view
            const currentStream = get().localStream;
            if (currentStream) {
              currentStream.addTrack(newVideoTrack);
            }

            await sfuManager.startCameraProducer(newVideoTrack);
            set(() => ({ isCameraOn: true }));
            emitMediaState({ isMicOn: get().isMicOn, isCameraOn: true });
          })
          .catch((err) => {
            console.error('[mediaStore] Failed to acquire camera:', err);
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              alert('No camera found. Please connect a webcam or check your system settings.');
            } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              alert('Camera access denied. Please allow camera permissions in your browser settings.');
            } else {
              alert('Could not start camera. It may be in use by another application.');
            }
          });
      }
    });
  },

  setRemoteMediaStream: (userId, mediaTag, stream) => {
    set((state) => {
      const existing = state.remoteMedia[userId] ?? {};
      const currentStream = existing[mediaTag];
      if (currentStream === stream) return {};

      if (currentStream) {
        stopStreamTracks(currentStream);
      }

      return {
        remoteMedia: {
          ...state.remoteMedia,
          [userId]: {
            ...existing,
            [mediaTag]: stream,
          },
        },
      };
    });
  },

  removeRemoteMediaStream: (userId, mediaTag) => {
    set((state) => {
      const existing = state.remoteMedia[userId];
      if (!existing || !existing[mediaTag]) return {};

      const currentStream = existing[mediaTag];
      if (currentStream) {
        stopStreamTracks(currentStream);
      }

      const updated = { ...existing };
      delete updated[mediaTag];

      // If no more streams for this user, remove the user entry entirely
      if (!updated.mic && !updated.camera && !updated.screen) {
        const remainingMedia = { ...state.remoteMedia };
        delete remainingMedia[userId];
        return { remoteMedia: remainingMedia };
      }

      return {
        remoteMedia: {
          ...state.remoteMedia,
          [userId]: updated,
        },
      };
    });
  },

  removeAllRemoteMediaForUser: (userId) => {
    const existing = get().remoteMedia[userId];
    if (!existing) return;

    if (existing.mic) stopStreamTracks(existing.mic);
    if (existing.camera) stopStreamTracks(existing.camera);
    if (existing.screen) stopStreamTracks(existing.screen);

    set((state) => {
      const remainingMedia = { ...state.remoteMedia };
      delete remainingMedia[userId];
      return { remoteMedia: remainingMedia };
    });
  },

  clearAllRemoteMedia: () => {
    const allMedia = get().remoteMedia;
    for (const userMedia of Object.values(allMedia)) {
      if (userMedia.mic) stopStreamTracks(userMedia.mic);
      if (userMedia.camera) stopStreamTracks(userMedia.camera);
      if (userMedia.screen) stopStreamTracks(userMedia.screen);
    }

    set(() => ({
      remoteMedia: {},
      screenSharingUsers: [],
      peerMediaStates: {},
    }));
  },

  startScreenShare: async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) return;

      const { sfuManager } = await import('@core/services/sfu/sfu.manager');
      await sfuManager.startScreenShareProducer(screenTrack);

      set(() => ({ screenStream, isScreenSharing: true }));
    } catch (err) {
      console.error('[mediaStore] Failed to start screen share:', err);
    }
  },

  stopScreenShare: () => {
    const { screenStream } = get();
    stopStreamTracks(screenStream);

    import('@core/services/sfu/sfu.manager').then(({ sfuManager }) => {
      sfuManager.stopScreenShareProducer().catch((err) => {
        console.error('[mediaStore] Failed to stop screen share producer:', err);
      });
    });

    set({ screenStream: null, isScreenSharing: false });
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

  updatePeerMediaState: (userId, state) => {
    set((current) => ({
      peerMediaStates: {
        ...current.peerMediaStates,
        [userId]: {
          ...(current.peerMediaStates[userId] || {
            isMicOn: true,
            isCameraOn: false,
          }),
          ...state,
        },
      },
    }));
  },
}));
