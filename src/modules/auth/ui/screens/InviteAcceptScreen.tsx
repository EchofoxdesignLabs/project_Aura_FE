import { useEffect, useState } from 'react';
import { useAuthStore } from '@core/store/auth.store';
import { Button } from '@core/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@core/ui/Card';
import { Input } from '@core/ui/Input';
import { apiClient, ApiError } from '@core/api/api.client';
import type { AvatarConfig, InviteDetails } from '@core/types';
import { AvatarPicker } from '@spatial/ui/components/AvatarPicker';
import { buildDefaultAvatarConfig } from '@spatial/utils/avatar-presets';

export function InviteAcceptScreen() {
  const { acceptInvite, error: storeError, clearError, isAuthenticated } = useAuthStore();
  const [token, setToken] = useState<string>('');
  
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(buildDefaultAvatarConfig);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    // Extract token from path e.g., /invite/abc123hex
    const pathParts = window.location.pathname.split('/invite/');
    if (pathParts.length > 1 && pathParts[1]) {
      const t = pathParts[1];
      setToken(t);
      fetchDetails(t);
    } else {
      setError('No invite token provided in URL.');
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated]);

  async function fetchDetails(t: string) {
    try {
      const details = await apiClient.get<InviteDetails>(`/auth/invites/${t}`);
      setInviteDetails(details);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404 || err.status === 400 || err.status === 410) {
          setError('This invite link is invalid or has expired.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to load invite details.');
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    setValidationError(null);

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    setIsAccepting(true);
    await acceptInvite(token, name, password, avatarConfig);
    setIsAccepting(false);
  }

  if (loadingDetails) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 text-white p-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="aura-orb left-[-12%] top-[-10%] h-[32rem] w-[32rem] bg-cyan-400/20" />
        <div className="aura-orb bottom-[-18%] right-[-10%] h-[36rem] w-[36rem] bg-blue-500/16" />
        <div className="aura-grid absolute inset-0 opacity-35" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {error ? (
          <Card className="border-rose-400/20 bg-slate-950/72 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-3 pb-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-400/10 text-rose-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <CardTitle className="text-2xl text-rose-100">Invite Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => window.location.href = '/'} variant="secondary">
                Back to Login
              </Button>
            </CardContent>
          </Card>
        ) : inviteDetails ? (
          <Card className="border-white/12 bg-slate-950/72 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-4 border-b border-white/8 pb-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-300 via-sky-300 to-blue-400 text-2xl font-bold text-slate-950 shadow-lg shadow-cyan-500/25">
                {inviteDetails.companyName.charAt(0).toUpperCase()}
              </div>
              <div>
                <CardTitle className="text-2xl mb-2 text-white">Join {inviteDetails.companyName}</CardTitle>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1 text-xs text-cyan-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  {inviteDetails.role === 'ORG_ADMIN' ? 'Organization Admin' : 'Employee'}
                </div>
              </div>
              <CardDescription>
                You've been invited by <span className="text-slate-300 font-medium">{inviteDetails.inviterName}</span>. 
                Complete your account setup below.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 text-left">
              {(storeError || validationError) ? (
                <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {storeError || validationError}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Email Address"
                  type="email"
                  value={inviteDetails.email}
                  disabled
                  className="opacity-60 cursor-not-allowed"
                />
                
                <Input
                  label="Full Name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />

                <Input
                  label="Create Password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />

                {/* Avatar Picker */}
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    Choose Your Avatar
                  </label>
                  <AvatarPicker value={avatarConfig} onChange={setAvatarConfig} compact />
                </div>

                <div className="pt-2">
                  <Button type="submit" className="w-full" isLoading={isAccepting}>
                    Join {inviteDetails.companyName}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
