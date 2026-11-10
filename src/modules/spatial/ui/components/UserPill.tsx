import { useState } from 'react';
import { useAuthStore } from '@core/store/auth.store';
import { getPresetFromConfig } from '@spatial/utils/avatar-presets';
import { ProfileSidebar } from './ProfileSidebar';

export function UserPill() {
  const user = useAuthStore((state) => state.user);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const preset = getPresetFromConfig(user?.avatarConfig);

  return (
    <>
      <button
        onClick={() => setIsSidebarOpen(true)}
        className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1.5 text-sm text-slate-200 shadow-lg backdrop-blur-md transition-all hover:border-white/20 hover:bg-slate-800/80"
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full border transition-all"
          style={{
            backgroundColor: preset.bodyColorCss,
            borderColor: `${preset.accentColorCss}88`,
          }}
        >
          <span className="text-xs leading-none">{preset.token}</span>
        </div>
        <span className="font-medium">{user?.name || 'Guest'}</span>
      </button>

      <ProfileSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </>
  );
}