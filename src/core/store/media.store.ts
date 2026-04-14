import { create } from 'zustand';

interface MediaStoreData {
  localStream: MediaStream | null;
  isMicOn: boolean;
  isCameraOn: boolean;
  isMediaInitialized: boolean;
  remoteStreams: Record<string, MediaStream>;
}

export interface MediaState extends MediaStoreData {
  initMedia: () => Promise<void>;
  stopMedia: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  addRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  clearAllRemoteStreams: () => void;
}

function createInitialMediaData(): MediaStoreData {
  return {
    localStream: null,
    isMicOn: false,
    isCameraOn: false,
    isMediaInitialized: false,
    remoteStreams: {},
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
    const localStream = get().localStream;
    stopStreamTracks(localStream);

    set(() => ({
      localStream: null,
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
    set(() => ({
      isMicOn: audioTrack.enabled,
    }));
  },
  toggleCamera: () => {
    const videoTrack = get().localStream?.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }

    videoTrack.enabled = !videoTrack.enabled;
    set(() => ({
      isCameraOn: videoTrack.enabled,
    }));
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
    }));
  },
}));
