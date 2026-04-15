import { User } from 'lucide-react';
import { useAuthStore } from '@core/store/auth.store';

export function UserPill() {
  const user = useAuthStore((state) => state.user);

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-sm text-slate-200 shadow-lg backdrop-blur-md">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
        <User className="h-3 w-3" />
      </div>
      <span className="font-medium">{user?.name || 'Guest'}</span>
    </div>
  );
}