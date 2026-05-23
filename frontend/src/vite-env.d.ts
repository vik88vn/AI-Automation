/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin for production builds (e.g. https://xxx.up.railway.app). */
  readonly VITE_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
