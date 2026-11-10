import { Camera, CameraOff, Mic, MicOff, Monitor, MonitorOff } from 'lucide-react';

import { useMediaStore } from '@core/store/media.store';

export function MediaToolbar() {
  const isMicOn = useMediaStore((state) => state.isMicOn);
  const isCameraOn = useMediaStore((state) => state.isCameraOn);
  const isScreenSharing = useMediaStore((state) => state.isScreenSharing);
  const isMediaInitialized = useMediaStore((state) => state.isMediaInitialized);
  const toggleMic = useMediaStore((state) => state.toggleMic);
  const toggleCamera = useMediaStore((state) => state.toggleCamera);
  const startScreenShare = useMediaStore((state) => state.startScreenShare);
  const stopScreenShare = useMediaStore((state) => state.stopScreenShare);

  const disabledClass = !isMediaInitialized ? 'cursor-not-allowed opacity-50' : '';

  return (
    <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-slate-900/80 px-6 py-3 shadow-lg backdrop-blur-md">
      {/* Mic toggle */}
      <button
        onClick={toggleMic}
        disabled={!isMediaInitialized}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isMicOn
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30'
        } ${disabledClass}`}
        title={isMediaInitialized ? (isMicOn ? 'Mute microphone' : 'Unmute microphone') : 'Media not initialized'}
      >
        {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      {/* Camera toggle */}
      <button
        onClick={toggleCamera}
        disabled={!isMediaInitialized}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isCameraOn
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600'
        } ${disabledClass}`}
        title={isMediaInitialized ? (isCameraOn ? 'Turn off camera' : 'Turn on camera') : 'Media not initialized'}
      >
        {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
      </button>

      {/* Screen share toggle */}
      <button
        onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        disabled={!isMediaInitialized}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isScreenSharing
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600'
        } ${disabledClass}`}
        title={isMediaInitialized ? (isScreenSharing ? 'Stop sharing screen' : 'Share screen') : 'Media not initialized'}
      >
        {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
      </button>
    </div>
  );
}
