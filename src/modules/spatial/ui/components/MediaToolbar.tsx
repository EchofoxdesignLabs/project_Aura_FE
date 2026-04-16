import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff } from 'lucide-react';
import { useMediaStore } from '@core/store/media.store';

export function MediaToolbar() {
  const {
    isMicOn, isCameraOn, isMediaInitialized, isScreenSharing,
    toggleMic, toggleCamera, startScreenShare, stopScreenShare,
  } = useMediaStore();

  return (
    <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/10 bg-slate-900/80 px-6 py-3 shadow-lg backdrop-blur-md">
      <button
        onClick={toggleMic}
        disabled={!isMediaInitialized}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isMicOn 
            ? 'bg-slate-700 text-white hover:bg-slate-600' 
            : 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30'
        } ${!isMediaInitialized ? 'cursor-not-allowed opacity-50' : ''}`}
        title={isMediaInitialized ? 'Toggle Microphone' : 'Media not initialized'}
      >
        {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      <button
        onClick={toggleCamera}
        disabled={!isMediaInitialized}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isCameraOn 
            ? 'bg-slate-700 text-white hover:bg-slate-600' 
            : 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30'
        } ${!isMediaInitialized ? 'cursor-not-allowed opacity-50' : ''}`}
        title={isMediaInitialized ? 'Toggle Camera' : 'Media not initialized'}
      >
        {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>

      {/* Screen share button */}
      <button
        onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        disabled={!isMediaInitialized}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
          isScreenSharing
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            : 'bg-slate-700 text-white hover:bg-slate-600'
        } ${!isMediaInitialized ? 'cursor-not-allowed opacity-50' : ''}`}
        title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
      >
        {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
      </button>
    </div>
  );
}
