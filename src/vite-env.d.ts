/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AURA_API_URL?: string;
  readonly VITE_AURA_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
