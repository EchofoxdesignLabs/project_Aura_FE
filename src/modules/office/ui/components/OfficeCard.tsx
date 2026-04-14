import { Button } from '@core/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@core/ui/Card';
import type { Office } from '@core/types';

interface OfficeCardProps {
  office: Office;
  onEnter: (officeId: string) => void;
  isConnecting: boolean;
}

export function OfficeCard({ office, onEnter, isConnecting }: OfficeCardProps) {
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden border-white/10 bg-slate-950/62 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300/25 hover:shadow-[0_24px_70px_rgba(8,145,178,0.18)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-300/10 via-transparent to-blue-400/8 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <CardHeader className="relative z-10 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-cyan-100 transition-colors group-hover:border-cyan-300/30 group-hover:bg-cyan-300/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01" />
                <path d="M12 6h.01" />
                <path d="M16 6h.01" />
                <path d="M8 10h.01" />
                <path d="M12 10h.01" />
                <path d="M16 10h.01" />
                <path d="M8 14h.01" />
                <path d="M12 14h.01" />
                <path d="M16 14h.01" />
              </svg>
            </div>

            <div>
              <CardTitle className="text-xl">{office.name}</CardTitle>
              <CardDescription>Ready for presence, movement, and meeting-zone flows.</CardDescription>
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-300">
            Office
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative z-10 flex flex-1 flex-col justify-between gap-6">
        <div className="grid grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Footprint</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {office.width}
              <span className="px-2 text-slate-500">x</span>
              {office.height}
            </p>
            <p className="mt-2 text-sm text-slate-400">Canvas size supplied by the backend office model.</p>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/8 bg-slate-900/70 p-4">
            <div className="grid h-full grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={`${office.id}-${index}`}
                  className={`rounded-md ${
                    index % 5 === 0
                      ? 'bg-cyan-300/35'
                      : index % 3 === 0
                        ? 'bg-blue-300/20'
                        : 'bg-white/7'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={() => onEnter(office.id)}
          isLoading={isConnecting}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting to Office' : 'Enter Office'}
        </Button>
      </CardContent>
    </Card>
  );
}
