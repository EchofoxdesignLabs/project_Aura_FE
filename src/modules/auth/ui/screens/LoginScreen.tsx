import { useEffect, useState } from 'react';

import { useAuthStore } from '@core/store/auth.store';
import { Button } from '@core/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@core/ui/Card';

import { LoginForm } from '../components/LoginForm';
import { RegisterForm } from '../components/RegisterForm';

type AuthMode = 'login' | 'register';

const onboardingHighlights = [
  {
    title: 'Live presence',
    description: 'See who is online, moving, and available before the Phaser layer lands.',
  },
  {
    title: 'Secure entry',
    description: 'Company registration and JWT-based sign-in now happen from the same onboarding surface.',
  },
  {
    title: 'Fast setup',
    description: 'New organizations can create an admin workspace without leaving the app.',
  },
] as const;

function AuthModeToggle({
  mode,
  onModeChange,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-slate-950/60 p-1">
      <Button
        type="button"
        variant={mode === 'login' ? 'secondary' : 'ghost'}
        className="justify-center"
        onClick={() => onModeChange('login')}
      >
        Sign In
      </Button>
      <Button
        type="button"
        variant={mode === 'register' ? 'secondary' : 'ghost'}
        className="justify-center"
        onClick={() => onModeChange('register')}
      >
        Create Workspace
      </Button>
    </div>
  );
}

export function LoginScreen() {
  const clearError = useAuthStore((state) => state.clearError);
  const [mode, setMode] = useState<AuthMode>('login');

  useEffect(() => {
    clearError();
  }, [clearError, mode]);

  const isLoginMode = mode === 'login';

  return (
    <div className="relative isolate flex min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 overflow-hidden">
        <div className="aura-orb left-[-12%] top-[-10%] h-[32rem] w-[32rem] bg-cyan-400/20" />
        <div className="aura-orb bottom-[-18%] right-[-10%] h-[36rem] w-[36rem] bg-blue-500/16" />
        <div className="aura-orb left-[42%] top-[14%] h-[20rem] w-[20rem] bg-sky-300/10" />
        <div className="aura-grid absolute inset-0 opacity-35" />
        <div className="aura-noise absolute inset-0 opacity-30" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10">
        <section className="flex flex-col justify-between rounded-[32px] border border-white/10 bg-white/[0.035] p-8 shadow-[0_24px_90px_rgba(2,8,23,0.4)] backdrop-blur-xl lg:p-10">
          <div className="space-y-8">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-cyan-300/20 bg-cyan-300/8 px-4 py-2 text-sm text-cyan-100">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.85)]" />
              Phase 7 onboarding refresh
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300 via-sky-300 to-blue-400 text-slate-950 shadow-lg shadow-cyan-500/25">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-7 w-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                    <path d="m2 12 10 5 10-5" />
                    <path d="m2 17 10 5 10-5" />
                  </svg>
                </div>

                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Project Aura</p>
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Virtual office access that finally feels intentional.
                  </h1>
                </div>
              </div>

              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                Sign in to your organization or create a new workspace from the same screen. This
                is still the Phase 7 onboarding shell, but it should now feel like a real product
                instead of a scaffold.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {onboardingHighlights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/8 bg-slate-950/40 p-5 shadow-lg shadow-slate-950/20"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2">
              Browser-only flow for the POC
            </div>
            <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2">
              Backend auth on ports 3000 / 3001
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <Card className="w-full max-w-xl overflow-hidden border-white/12 bg-slate-950/72">
            <CardHeader className="space-y-5 border-b border-white/8 pb-6">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Access Portal</p>
                <CardTitle className="text-3xl">
                  {isLoginMode ? 'Enter your workspace' : 'Create your company workspace'}
                </CardTitle>
                <CardDescription>
                  {isLoginMode
                    ? 'Use your admin credentials to continue into office selection.'
                    : 'Register an organization, create the first admin account, and continue straight into setup.'}
                </CardDescription>
              </div>

              <AuthModeToggle mode={mode} onModeChange={setMode} />
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              {isLoginMode ? (
                <LoginForm onSwitchToRegister={() => setMode('register')} />
              ) : (
                <RegisterForm onSwitchToLogin={() => setMode('login')} />
              )}

              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                {isLoginMode
                  ? 'No self-service user signup exists yet. Workspace creation is organization-level and produces the first admin account.'
                  : 'After a successful registration, the app will attempt to sign you in automatically with the admin credentials you just created.'}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
