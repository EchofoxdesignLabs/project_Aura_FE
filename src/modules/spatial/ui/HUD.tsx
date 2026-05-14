import { useEffect } from 'react';
import { ZoneBadge } from './components/ZoneBadge';
import { UserPill } from './components/UserPill';
import { PresenceCounter } from './components/PresenceCounter';
import { MediaToolbar } from './components/MediaToolbar';
import { Minimap } from './components/Minimap';
import { DeskPanel } from './components/DeskPanel';

export function HUD() {
  useEffect(() => {
    console.log('[HUD] Overlay mounted successfully.');
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6">
      {/* Top Row: Zone Context and User Identity */}
      <div className="flex w-full items-start justify-between">
        <ZoneBadge />
        <UserPill />
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