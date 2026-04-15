import { MapPin } from 'lucide-react';
import { useGameStore } from '@core/store/game.store';

export function ZoneBadge() {
  const currentZone = useGameStore((state) => state.currentZone);

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur-md transition-all">
      <MapPin className="h-4 w-4 text-cyan-400" />
      <span className="font-medium">
        {currentZone ? currentZone.name : 'Lobby'}
      </span>
    </div>
  );
}