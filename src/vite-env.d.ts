/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TWELVEDATA_KEY: string;
  // Base URL of the PropDesk MetaApi backend (see /server). Defaults to
  // /api/metaapi (same-origin) if unset — only needed if the backend is
  // hosted on a different origin than the frontend.
  readonly VITE_METAAPI_BACKEND_URL?: string;
  // Must match the backend's METAAPI_API_KEY exactly — sent as the
  // x-api-key header on every request. Note: like any VITE_ var, this is
  // visible in the built JS bundle, not a true secret from the browser's
  // own user.
  readonly VITE_METAAPI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
