import { create } from 'zustand';

interface MediaStoreData {
  localStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isMediaInitialized: boolean;
  remoteStreams: Record<string, MediaStream>;
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
  addRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  clearAllRemoteStreams: () => void;
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

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    const previousStream = get().localStream;
    if (previousStream && previousStream !== stream) {
      stopStreamTracks(previousStream);
    }

    const audioTrack = stream.getAudioTracks()[0];

    set(() => ({
      localStream: stream,
      isMicOn: audioTrack?.enabled ?? false,
      isCameraOn: false,
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
  },

  toggleCamera: () => {
    console.warn('[mediaStore] Camera is disabled during the Phase 1 audio-only SFU migration.');
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

  startScreenShare: async () => {
    console.warn('[mediaStore] Screen share is disabled during the Phase 1 audio-only SFU migration.');
  },

  stopScreenShare: () => {
    stopStreamTracks(get().screenStream);
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
