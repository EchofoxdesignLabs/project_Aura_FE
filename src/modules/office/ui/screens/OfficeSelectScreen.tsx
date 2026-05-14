import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@core/api/api.client';
import { socketService } from '@core/services/socket.service';
import { useAuthStore } from '@core/store/auth.store';
import { useGameStore } from '@core/store/game.store';
import { Button } from '@core/ui/Button';
import { Card, CardContent } from '@core/ui/Card';
import type { Office, OfficeStatePayload } from '@core/types';

import { OfficeCard } from '../components/OfficeCard';
import { InviteModal } from '../components/InviteModal';

export function OfficeSelectScreen() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);

  const setOffice = useGameStore((state) => state.setOffice);
  const setAllPlayers = useGameStore((state) => state.setAllPlayers);
  const setLocalPlayerId = useGameStore((state) => state.setLocalPlayerId);

  const [offices, setOffices] = useState<Office[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [connectingOfficeId, setConnectingOfficeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const officeCountLabel = useMemo(
    () => `${offices.length.toString().padStart(2, '0')} office${offices.length === 1 ? '' : 's'}`,
    [offices.length],
  );

  async function fetchOffices() {
    try {
      setIsLoading(true);
      setError(null);

      const data = await apiClient.get<Office[]>('/office');
      setOffices(data);
    } catch (fetchError) {
      console.error('Failed to fetch offices:', fetchError);
      setError('Unable to load offices right now. Check the backend API and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchOffices();
  }, []);

  async function handleSeedOffice() {
    try {
      setIsSeeding(true);
      setError(null);
      await apiClient.post('/office/seed', {});
      await fetchOffices();
    } catch (seedError) {
      console.error('Failed to seed office:', seedError);
      setError('Unable to create the default office. Please verify the backend office service.');
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleReseedOffice() {
    if (!window.confirm('This will DELETE all existing offices and create a fresh one with the correct isometric layout. Continue?')) {
      return;
    }
    try {
      setIsSeeding(true);
      setError(null);
      await apiClient.post('/office/reseed', {});
      await fetchOffices();
    } catch (reseedError) {
      console.error('Failed to reseed office:', reseedError);
      setError('Unable to reset the office layout. Please verify the backend office service.');
    } finally {
      setIsSeeding(false);
    }
  }

  async function handleEnterOffice(officeId: string) {
    if (!token || !user) {
      setError('Your session is missing. Please sign in again.');
      return;
    }

    const targetOffice = offices.find((office) => office.id === officeId);
    if (!targetOffice) {
      setError('The selected office could not be found.');
      return;
    }

    setConnectingOfficeId(officeId);
    setError(null);

    try {
      await socketService.connect(token);

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          socketService.off('office:state', onceHandler);
          reject(new Error('Timed out while waiting for office state.'));
        }, 10000);

        const onceHandler = (state: OfficeStatePayload) => {
          window.clearTimeout(timeout);
          socketService.off('office:state', onceHandler);
          setLocalPlayerId(user.id);
          setOffice(state.office, state.zones);
          setAllPlayers(state.players);
          resolve();
        };

        socketService.on('office:state', onceHandler);
        socketService.emit('office:join', { officeId });
      });
    } catch (connectionError) {
      console.error('Failed to enter office:', connectionError);
      socketService.disconnect();
      setError('Unable to join the office in realtime. Check ports 3000 and 3001, then try again.');
    } finally {
      setConnectingOfficeId(null);
    }
  }

  return (
    <div className="relative h-screen overflow-y-auto bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aura-orb left-[-8%] top-[-14%] h-[28rem] w-[28rem] bg-cyan-300/16" />
        <div className="aura-orb right-[-8%] top-[8%] h-[24rem] w-[24rem] bg-blue-400/14" />
        <div className="aura-grid absolute inset-0 opacity-20" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-6 rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(2,8,23,0.45)] backdrop-blur-xl lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-300">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" />
              Authenticated as {user?.role ?? 'member'}
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Welcome back, {user?.name?.split(' ')[0] ?? 'Explorer'}.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                Choose the office you want to enter. If your organization is brand-new, create the
                default layout here and move straight into the realtime flow.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:min-w-[22rem]">
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-white/8 bg-slate-950/55">
                <CardContent className="space-y-2 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Organization</p>
                  <p className="text-lg font-semibold text-white">{user?.company ?? 'Unknown'}</p>
                </CardContent>
              </Card>
              <Card className="border-white/8 bg-slate-950/55">
                <CardContent className="space-y-2 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Availability</p>
                  <p className="text-lg font-semibold text-white">{officeCountLabel}</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-3">
              {offices.length === 0 ? (
                <Button
                  onClick={handleSeedOffice}
                  variant="secondary"
                  isLoading={isSeeding}
                  disabled={isSeeding}
                >
                  {isSeeding ? 'Creating Office' : 'Create Default Office'}
                </Button>
              ) : (
                <Button onClick={() => void fetchOffices()} variant="secondary" disabled={isLoading}>
                  Refresh Offices
                </Button>
              )}
              {user?.role === 'ORG_ADMIN' ? (
                <>
                  <Button variant="outline" onClick={() => setInviteOpen(true)}>
                    + Invite Member
                  </Button>
                  {offices.length > 0 && (
                    <Button
                      variant="ghost"
                      className="text-amber-400 hover:text-amber-300"
                      onClick={handleReseedOffice}
                      disabled={isSeeding}
                    >
                      {isSeeding ? 'Resetting...' : '⟳ Reset Office Layout'}
                    </Button>
                  )}
                </>
              ) : null}
              <Button onClick={logout} variant="ghost" className="text-slate-300">
                Sign Out
              </Button>
            </div>
          </div>
        </header>

        <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

        {error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`office-skeleton-${index}`}
                className="h-72 animate-pulse rounded-[28px] border border-white/8 bg-white/[0.04]"
              />
            ))}
          </div>
        ) : offices.length > 0 ? (
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {offices.map((office) => (
              <OfficeCard
                key={office.id}
                office={office}
                onEnter={handleEnterOffice}
                isConnecting={connectingOfficeId === office.id}
              />
            ))}
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
            <Card className="border-dashed border-white/12 bg-slate-950/58">
              <CardContent className="space-y-5 p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-cyan-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 21h18" />
                    <path d="M5 21V7l8-4v18" />
                    <path d="M19 21V11l-6-4" />
                    <path d="M9 9h.01" />
                    <path d="M9 12h.01" />
                    <path d="M9 15h.01" />
                    <path d="M9 18h.01" />
                  </svg>
                </div>

                <div className="space-y-3">
                  <h2 className="text-3xl font-semibold tracking-tight text-white">
                    No offices yet for {user?.company ?? 'your organization'}.
                  </h2>
                  <p className="max-w-2xl text-base leading-7 text-slate-300">
                    That usually means this is a brand-new company workspace. Create the default
                    office layout to unlock the next step of the realtime onboarding flow.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSeedOffice} isLoading={isSeeding} disabled={isSeeding}>
                    {isSeeding ? 'Creating Default Office' : 'Create Default Office'}
                  </Button>
                  <Button onClick={logout} variant="outline">
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03]">
              <CardContent className="space-y-4 p-8">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-500">What happens next</p>
                <div className="space-y-4 text-sm leading-7 text-slate-300">
                  <p>1. The frontend calls `POST /office/seed` to create the default HQ layout.</p>
                  <p>2. Office cards appear immediately after the refresh completes.</p>
                  <p>3. Selecting a card connects to realtime and requests `office:state`.</p>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
