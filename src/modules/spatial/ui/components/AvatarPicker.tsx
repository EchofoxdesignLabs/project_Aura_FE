import { useState } from 'react';
import type { AvatarConfig } from '@core/types';
import {
  AVATAR_PRESETS,
  AVATAR_PALETTES,
  getPreset,
  DEFAULT_PRESET,
  DEFAULT_PALETTE,
  type AvatarPreset,
} from '@spatial/utils/avatar-presets';

interface AvatarPickerProps {
  /** Currently-selected config. Omit for defaults. */
  value?: AvatarConfig;
  /** Called when the user selects a different preset / palette. */
  onChange: (next: AvatarConfig) => void;
  /** Compact mode hides palette row and labels (used inside auth forms). */
  compact?: boolean;
}

export function AvatarPicker({ value, onChange, compact = false }: AvatarPickerProps) {
  const selectedPresetId = value?.presetId ?? DEFAULT_PRESET.id;
  const selectedPaletteId = value?.paletteId ?? DEFAULT_PALETTE.id;
  const activePreset = getPreset(selectedPresetId);

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function selectPreset(preset: AvatarPreset) {
    onChange({ version: 1, presetId: preset.id, paletteId: selectedPaletteId });
  }

  function selectPalette(paletteId: string) {
    onChange({ version: 1, presetId: selectedPresetId, paletteId });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Preview ── */}
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 shadow-lg transition-all duration-300"
          style={{
            backgroundColor: activePreset.bodyColorCss,
            borderColor: activePreset.accentColorCss,
            boxShadow: `0 0 24px ${activePreset.bodyColorCss}44`,
          }}
        >
          <span className="text-2xl leading-none">{activePreset.token}</span>
        </div>

        {!compact && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-100">{activePreset.label}</span>
            <span className="text-xs text-slate-400">Selected avatar</span>
          </div>
        )}
      </div>

      {/* ── Preset Grid ── */}
      {!compact && (
        <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Choose Avatar
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        {AVATAR_PRESETS.map((preset) => {
          const isSelected = preset.id === selectedPresetId;
          const isHovered = preset.id === hoveredId;

          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              onMouseEnter={() => setHoveredId(preset.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => selectPreset(preset)}
              className="group relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              style={{
                backgroundColor: preset.bodyColorCss,
                borderColor: isSelected
                  ? preset.accentColorCss
                  : isHovered
                    ? `${preset.accentColorCss}88`
                    : 'transparent',
                transform: isSelected ? 'scale(1.15)' : isHovered ? 'scale(1.08)' : 'scale(1)',
                boxShadow: isSelected ? `0 0 16px ${preset.bodyColorCss}55` : 'none',
              }}
            >
              <span className="text-sm leading-none">{preset.token}</span>
            </button>
          );
        })}
      </div>

      {/* ── Palette Row ── */}
      {!compact && (
        <>
          <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Colour Palette
          </label>
          <div className="flex gap-2">
            {AVATAR_PALETTES.map((palette) => {
              const isSelected = palette.id === selectedPaletteId;

              return (
                <button
                  key={palette.id}
                  type="button"
                  title={palette.label}
                  onClick={() => selectPalette(palette.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                  style={{
                    backgroundColor: palette.tintCss,
                    borderColor: isSelected ? '#ffffff' : 'transparent',
                    transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
