/**
 * Resolves a file under `public/` against Vite's `base` ('./'), so the same path works in the browser and
 * in the packaged Electron app (file://). Pass paths without a leading slash, e.g. 'assets/maps/x.tmj'.
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
