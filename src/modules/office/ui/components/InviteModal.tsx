import { useState } from 'react';
import { useAuthStore } from '@core/store/auth.store';
import { Button } from '@core/ui/Button';
import { Input } from '@core/ui/Input';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

export function InviteModal({ open, onClose }: InviteModalProps) {
  const { createInvite, inviteLoading, inviteError, clearError } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [roleName, setRoleName] = useState<'EMPLOYEE' | 'ORG_ADMIN'>('EMPLOYEE');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    try {
      const res = await createInvite(email, roleName);
      if (res && res.inviteUrl) {
         setInviteUrl(res.inviteUrl);
      }
    } catch {
      // Error handled by store
    }
  }

  function handleCopy() {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleClose() {
    clearError();
    setInviteUrl(null);
    setEmail('');
    setRoleName('EMPLOYEE');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl animate-scaleIn">
        <button 
          onClick={handleClose}
          className="absolute right-6 top-6 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white focus:outline-none">Invite Teammate</h2>
          <p className="mt-2 text-sm text-slate-400">
            Generate an invitation link to bring a new member into your organization workspace.
          </p>
        </div>

        {inviteError ? (
          <div className="mb-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {inviteError}
          </div>
        ) : null}

        {inviteUrl ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-emerald-200">Invitation Link Generated</span>
                <div className="flex items-center gap-2 rounded-xl bg-slate-950/50 p-3 overflow-hidden">
                  <span className="truncate text-sm text-slate-300 select-all font-mono">
                    {inviteUrl}
                  </span>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={handleCopy} 
              className="w-full"
              variant={copied ? "secondary" : "primary"}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
            <p className="text-center text-xs text-slate-500">
              Only share this link with the intended recipient. It will expire in 7 days.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@domain.com"
            />
            
            <div className="flex w-full flex-col gap-2">
              <label htmlFor="role" className="pl-1 text-sm font-medium tracking-[0.01em] text-slate-200">
                Role
              </label>
              <select
                id="role"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value as 'EMPLOYEE' | 'ORG_ADMIN')}
                className="flex h-12 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white shadow-inner shadow-slate-950/40 outline-none transition-all duration-200 focus:border-cyan-300/45 focus:bg-slate-950/70 focus:ring-2 focus:ring-cyan-300/20"
              >
                <option value="EMPLOYEE">Employee (Standard Access)</option>
                <option value="ORG_ADMIN">Organization Admin</option>
              </select>
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full" isLoading={inviteLoading}>
                Generate Invite Link
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
