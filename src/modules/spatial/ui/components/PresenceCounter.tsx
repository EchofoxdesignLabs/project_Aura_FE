import { Users } from 'lucide-react';
import { useGameStore } from '@core/store/game.store';

export function PresenceCounter() {
  const players = useGameStore((state) => state.players);
  const onlineCount = Object.keys(players).length;

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur-md">
      <Users className="h-4 w-4 text-emerald-400" />
      <span className="font-medium">{onlineCount} Online</span>
    </div>
  );
}