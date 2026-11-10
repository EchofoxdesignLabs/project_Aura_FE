import { useEffect } from 'react';
import { ZoneBadge } from './components/ZoneBadge';
import { UserPill } from './components/UserPill';
import { PresenceCounter } from './components/PresenceCounter';
import { MediaToolbar } from './components/MediaToolbar';
import { Minimap } from './components/Minimap';
import { DeskPanel } from './components/DeskPanel';
import { useAuthStore } from '@core/store/auth.store';
import { useBuilderStore } from '../../builder/state/builder.store';

export function HUD() {
  const userRole = useAuthStore((s) => s.user?.role);
  const isEditMode = useBuilderStore((s) => s.isEditMode);
  const enterEditMode = useBuilderStore((s) => s.enterEditMode);

  const isAdmin = userRole === 'ORG_ADMIN';

  useEffect(() => {
    console.log('[HUD] Overlay mounted successfully.');
  }, []);

  // Hide full HUD in edit mode (builder has its own toolbar)
  if (isEditMode) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6">
      {/* Top Row: Zone Context and User Identity */}
      <div className="flex w-full items-start justify-between">
        <ZoneBadge />
        <div className="flex items-center gap-2">
          {/* Edit Office Button — ORG_ADMIN only */}
          {isAdmin && (
            <button
              id="btn-edit-office"
              onClick={enterEditMode}
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 shadow-lg backdrop-blur-md transition-all hover:border-cyan-500/40 hover:bg-slate-800/90 hover:text-cyan-300 hover:shadow-cyan-500/10"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
              Edit Office
            </button>
          )}
          <UserPill />
        </div>
      </div>

      {/* Bottom Row: Presence, Media, Minimap, and Desk Panel */}
      <div className="flex w-full items-end justify-between">
        <div className="flex flex-col gap-2 flex-1 justify-start">
          <DeskPanel />
          <PresenceCounter />
        </div>

        <div className="flex flex-1 justify-center">
          <MediaToolbar />
        </div>

        <div className="flex flex-1 justify-end">
          <Minimap />
        </div>
      </div>
    </div>
  );
}