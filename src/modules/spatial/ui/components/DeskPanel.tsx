import { useState } from 'react';
import { MapPin, UserPlus, UserMinus, Navigation } from 'lucide-react';
import { useGameStore } from '@core/store/game.store';
import { useAuthStore } from '@core/store/auth.store';
import { ZoneType } from '@core/types';
import { getDeskPanelNetworkManager } from '../../utils/desk-panel-bridge';

export function DeskPanel() {
  const user = useAuthStore((s) => s.user);
  const zones = useGameStore((s) => s.zones);
  const selectedDeskZoneId = useGameStore((s) => s.selectedDeskZoneId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedZone = selectedDeskZoneId
    ? zones.find((z) => z.id === selectedDeskZoneId && z.type === ZoneType.PRIVATE_DESK)
    : null;

  // Check if the current user has any assigned desk
  const myDesk = zones.find(
    (z) => z.type === ZoneType.PRIVATE_DESK && z.assignedUserId === user?.id,
  );

  const isOwnDesk = selectedZone?.assignedUserId === user?.id;
  const isUnassigned = selectedZone && !selectedZone.assignedUserId;
  const isAdmin = user?.role === 'ORG_ADMIN';

  async function handleClaim() {
    const nm = getDeskPanelNetworkManager();
    if (!selectedZone || !nm) return;
    setIsLoading(true);
    setError(null);
    try {
      await nm.assignDesk(selectedZone.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to claim desk');
    }
    setIsLoading(false);
  }

  async function handleRelease() {
    const nm = getDeskPanelNetworkManager();
    if (!selectedZone || !nm) return;
    setIsLoading(true);
    setError(null);
    try {
      await nm.unassignDesk(selectedZone.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to release desk');
    }
    setIsLoading(false);
  }

  async function handleGoToMyDesk() {
    const nm = getDeskPanelNetworkManager();
    if (!nm) return;
    setIsLoading(true);
    setError(null);
    try {
      await nm.goToMyDesk();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No desk assigned');
    }
    setIsLoading(false);
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      {/* Go to My Desk button — always visible if user has a desk */}
      {myDesk && (
        <button
          onClick={handleGoToMyDesk}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 shadow-lg backdrop-blur-md transition-all hover:border-cyan-400/40 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          <Navigation className="h-4 w-4" />
          Go to My Desk
        </button>
      )}

      {/* Selected desk panel */}
      {selectedZone && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/90 p-3 shadow-lg backdrop-blur-md">
          {/* Desk header */}
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">{selectedZone.name}</span>
          </div>

          {/* Assignment status */}
          <div className="text-xs text-slate-400">
            {selectedZone.assignedUserName
              ? `Assigned to ${isOwnDesk ? 'you' : selectedZone.assignedUserName}`
              : 'Unassigned'}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isUnassigned && !myDesk && (
              <button
                onClick={handleClaim}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/30 disabled:opacity-50"
              >
                <UserPlus className="h-3 w-3" />
                Claim
              </button>
            )}

            {isOwnDesk && (
              <button
                onClick={handleRelease}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/30 disabled:opacity-50"
              >
                <UserMinus className="h-3 w-3" />
                Release
              </button>
            )}

            {isAdmin && !isOwnDesk && selectedZone.assignedUserId && (
              <button
                onClick={handleRelease}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-all hover:bg-amber-500/30 disabled:opacity-50"
              >
                <UserMinus className="h-3 w-3" />
                Clear (Admin)
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-xs text-rose-200">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
