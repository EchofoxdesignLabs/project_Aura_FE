const DEFAULT_AURA_API_URL = 'http://localhost:3000';
const DEFAULT_AURA_REALTIME_URL = 'http://localhost:3001';

function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function resolveUrl(value: string | undefined, fallback: string): string {
  const trimmedValue = value?.trim();
  return normalizeUrl(trimmedValue && trimmedValue.length > 0 ? trimmedValue : fallback);
}

export const AURA_API_URL = resolveUrl(
  import.meta.env.VITE_AURA_API_URL,
  DEFAULT_AURA_API_URL,
);

export const AURA_REALTIME_URL = resolveUrl(
  import.meta.env.VITE_AURA_REALTIME_URL,
  DEFAULT_AURA_REALTIME_URL,
);
