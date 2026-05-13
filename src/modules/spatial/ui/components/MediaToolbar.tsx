import { Mic, MicOff } from 'lucide-react';

import { useMediaStore } from '@core/store/media.store';

export function MediaToolbar() {
  const isMicOn = useMediaStore((state) => state.isMicOn);
  const isMediaInitialized = useMediaStore((state) => state.isMediaInitialized);
  const toggleMic = useMediaStore((state) => state.toggleMic);

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
    </div>
  );
}
