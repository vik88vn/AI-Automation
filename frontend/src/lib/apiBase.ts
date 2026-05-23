// ─────────────────────────────────────────────────────────────────────────
// Backend base URL resolution.
//
// In local dev, VITE_API_TARGET is unset, so API_BASE is "" and requests use
// relative /api/* paths — Vite's dev server proxies those to the backend
// (see vite.config.ts). In production (a static build on Cloudflare Pages)
// there is no proxy, so VITE_API_TARGET must be set at build time to the
// backend's absolute origin (e.g. https://xxx.up.railway.app); every request
// is then sent there directly (the backend sets permissive CORS headers).
// ─────────────────────────────────────────────────────────────────────────

// Trim a trailing slash so `${API_BASE}/api/...` never double-slashes.
const raw = import.meta.env.VITE_API_TARGET ?? "";
export const API_BASE = raw.replace(/\/$/, "");

/** Prefix an `/api/...` path with the configured backend origin. */
export const apiUrl = (path: string): string => `${API_BASE}${path}`;
