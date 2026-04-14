import { useGameStore } from '@core/store/game.store';

export function GameContainer() {
  const currentOfficeId = useGameStore((state) => state.currentOfficeId);
  const officeData = useGameStore((state) => state.officeData);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aura-orb left-[-10%] top-[-18%] h-[30rem] w-[30rem] bg-cyan-300/14" />
        <div className="aura-orb bottom-[-15%] right-[-6%] h-[28rem] w-[28rem] bg-blue-400/16" />
        <div className="aura-grid absolute inset-0 opacity-25" />
      </div>

      <div className="relative z-10 w-full max-w-3xl px-6">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-10 text-center shadow-[0_24px_90px_rgba(2,8,23,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_50px_rgba(34,211,238,0.14)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-11 w-11 text-cyan-200"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 12 10 5 10-5" />
              <path d="m2 17 10 5 10-5" />
            </svg>
          </div>

          <p className="mt-8 text-sm uppercase tracking-[0.24em] text-slate-500">Phase 7 checkpoint</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Office connection established
          </h1>
          <p className="mt-4 text-xl text-cyan-200">{officeData?.name ?? currentOfficeId}</p>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
            The onboarding flow is working and the app has office context from realtime. Phaser,
            avatars, and movement enter in Phase 8.
          </p>

          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/6 px-5 py-3 text-sm text-slate-300">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300" />
            Waiting for the spatial engine bootstrap
          </div>
        </div>
      </div>
    </div>
  );
}
