import type { AvatarConfig } from '@core/types';

/**
 * Avatar preset catalog — v1.
 *
 * Each preset defines a stable `id` used as `presetId` in `AvatarConfig`,
 * a display label, and visual token data (body + accent hex colors, initials
 * fallback character). The palette IDs are independent and control colour
 * families — one palette can be shared across multiple presets.
 *
 * When the full character builder ships (Phase 2J), presets will still
 * exist as "quick-start" options, and `AvatarConfig.version` will bump to 2
 * with additional layered properties.
 */

export interface AvatarPreset {
  /** Stable preset identifier stored in the DB. */
  id: string;
  /** Human-readable name shown in the picker UI. */
  label: string;
  /** Primary body fill colour (hex number for Phaser, CSS string for React). */
  bodyColor: number;
  /** CSS-formatted body colour. */
  bodyColorCss: string;
  /** Accent / outline colour (hex number for Phaser). */
  accentColor: number;
  /** CSS-formatted accent colour. */
  accentColorCss: string;
  /** Single character rendered inside the avatar circle. */
  token: string;
}

export interface AvatarPalette {
  id: string;
  label: string;
  /** Tints applied over the base preset colours. */
  tint: number;
  tintCss: string;
}

// ─── Presets ───

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'aura-01', label: 'Nova',    bodyColor: 0x06b6d4, bodyColorCss: '#06b6d4', accentColor: 0x22d3ee, accentColorCss: '#22d3ee', token: '✦' },
  { id: 'aura-02', label: 'Ember',   bodyColor: 0xef4444, bodyColorCss: '#ef4444', accentColor: 0xfca5a5, accentColorCss: '#fca5a5', token: '☀' },
  { id: 'aura-03', label: 'Sage',    bodyColor: 0x10b981, bodyColorCss: '#10b981', accentColor: 0x6ee7b7, accentColorCss: '#6ee7b7', token: '❋' },
  { id: 'aura-04', label: 'Orchid',  bodyColor: 0x8b5cf6, bodyColorCss: '#8b5cf6', accentColor: 0xc4b5fd, accentColorCss: '#c4b5fd', token: '✿' },
  { id: 'aura-05', label: 'Sunset',  bodyColor: 0xf97316, bodyColorCss: '#f97316', accentColor: 0xfdba74, accentColorCss: '#fdba74', token: '◈' },
  { id: 'aura-06', label: 'Blossom', bodyColor: 0xec4899, bodyColorCss: '#ec4899', accentColor: 0xf9a8d4, accentColorCss: '#f9a8d4', token: '✾' },
  { id: 'aura-07', label: 'Storm',   bodyColor: 0x6366f1, bodyColorCss: '#6366f1', accentColor: 0xa5b4fc, accentColorCss: '#a5b4fc', token: '⚡' },
  { id: 'aura-08', label: 'Coral',   bodyColor: 0xf43f5e, bodyColorCss: '#f43f5e', accentColor: 0xfda4af, accentColorCss: '#fda4af', token: '◉' },
  { id: 'aura-09', label: 'Mint',    bodyColor: 0x14b8a6, bodyColorCss: '#14b8a6', accentColor: 0x5eead4, accentColorCss: '#5eead4', token: '❖' },
  { id: 'aura-10', label: 'Gold',    bodyColor: 0xeab308, bodyColorCss: '#eab308', accentColor: 0xfde047, accentColorCss: '#fde047', token: '★' },
];

// ─── Palettes ───

export const AVATAR_PALETTES: AvatarPalette[] = [
  { id: 'ocean',   label: 'Ocean',   tint: 0x06b6d4, tintCss: '#06b6d4' },
  { id: 'ember',   label: 'Ember',   tint: 0xef4444, tintCss: '#ef4444' },
  { id: 'forest',  label: 'Forest',  tint: 0x10b981, tintCss: '#10b981' },
  { id: 'violet',  label: 'Violet',  tint: 0x8b5cf6, tintCss: '#8b5cf6' },
  { id: 'sunset',  label: 'Sunset',  tint: 0xf97316, tintCss: '#f97316' },
  { id: 'neutral', label: 'Neutral', tint: 0x94a3b8, tintCss: '#94a3b8' },
];

// ─── Lookup helpers ───

const PRESET_MAP = new Map(AVATAR_PRESETS.map((p) => [p.id, p]));
const PALETTE_MAP = new Map(AVATAR_PALETTES.map((p) => [p.id, p]));

export const DEFAULT_PRESET = AVATAR_PRESETS[0];
export const DEFAULT_PALETTE = AVATAR_PALETTES[0];

export function getPreset(presetId: string): AvatarPreset {
  return PRESET_MAP.get(presetId) ?? DEFAULT_PRESET;
}

export function getPalette(paletteId: string): AvatarPalette {
  return PALETTE_MAP.get(paletteId) ?? DEFAULT_PALETTE;
}

export function getPresetFromConfig(config: AvatarConfig | undefined | null): AvatarPreset {
  return getPreset(config?.presetId ?? DEFAULT_PRESET.id);
}

export function buildDefaultAvatarConfig(): AvatarConfig {
  return { version: 1, presetId: DEFAULT_PRESET.id, paletteId: DEFAULT_PALETTE.id };
}
