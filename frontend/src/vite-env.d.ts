/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for production builds (e.g. https://xxx.up.railway.app). */
  readonly VITE_API_TARGET?: string;
  /** Shared-secret token sent as `x-qa-token` to the backend. */
  readonly VITE_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
