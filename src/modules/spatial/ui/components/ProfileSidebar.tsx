import { useState } from 'react';
import { X, LogOut } from 'lucide-react';
import { useAuthStore } from '@core/store/auth.store';
import type { AvatarConfig } from '@core/types';
import { AvatarPicker } from './AvatarPicker';
import { getPresetFromConfig } from '@spatial/utils/avatar-presets';

interface ProfileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileSidebar({ isOpen, onClose }: ProfileSidebarProps) {
  const user = useAuthStore((s) => s.user);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const logout = useAuthStore((s) => s.logout);

  const [pendingAvatar, setPendingAvatar] = useState<AvatarConfig | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!user) return null;

  const currentConfig = pendingAvatar ?? user.avatarConfig;
  const preset = getPresetFromConfig(currentConfig);
  const hasChanges =
    pendingAvatar !== null &&
    (pendingAvatar.presetId !== user.avatarConfig.presetId ||
      pendingAvatar.paletteId !== user.avatarConfig.paletteId);

  async function handleSave() {
    if (!pendingAvatar || !hasChanges) return;
    setSaveSuccess(false);
    await updateAvatar(pendingAvatar);
    setSaveSuccess(true);
    setPendingAvatar(null);
    setTimeout(() => setSaveSuccess(false), 2000);
  }

  function handleClose() {
    setPendingAvatar(null);
    setSaveSuccess(false);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-fadeIn"
          onClick={handleClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`pointer-events-auto fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-white/8 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Profile
          </h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Info */}
        <div className="flex flex-col items-center gap-3 border-b border-white/8 px-5 py-6">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 shadow-lg transition-all duration-300"
            style={{
              backgroundColor: preset.bodyColorCss,
              borderColor: preset.accentColorCss,
              boxShadow: `0 0 32px ${preset.bodyColorCss}44`,
            }}
          >
            <span className="text-3xl leading-none">{preset.token}</span>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-white">{user.name}</p>
            <p className="text-xs text-slate-400">{user.role === 'ORG_ADMIN' ? 'Admin' : 'Employee'}</p>
          </div>
        </div>

        {/* Avatar Picker */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <AvatarPicker
            value={currentConfig}
            onChange={(next) => {
              setPendingAvatar(next);
              setSaveSuccess(false);
            }}
          />

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Success */}
          {saveSuccess && (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
              Avatar updated!
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 border-t border-white/8 px-5 py-4">
          {hasChanges && (
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:bg-cyan-400 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                'Save Changes'
              )}
            </button>
          )}

          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-300 transition-all hover:bg-white/8 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
