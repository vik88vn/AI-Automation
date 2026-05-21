// Minimal in-memory rate limiter (fixed-window).
//
// Protects brute-forceable endpoints (login/signup) without an external store.
// For a single-instance backend this is sufficient; a multi-instance SaaS
// deployment should swap the Map for Redis (same interface). Keys are usually
// client IP + route.
//
// Not a substitute for account lockout or CAPTCHA, but raises the cost of
// credential-stuffing from "free" to "rate-limited".

import type { IncomingMessage } from "node:http";
import { HttpError } from "./http.js";

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// Periodically evict expired buckets so the Map can't grow unbounded.
let lastSweep = Date.now();
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of buckets) {
    if (w.resetAt <= now) buckets.delete(key);
  }
}

// Best-effort client IP: respects X-Forwarded-For (set by Cloudflare/Railway
// proxies) but falls back to the socket address.
export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

// Throws HttpError(429) when the caller exceeds `limit` requests per `windowMs`.
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) {
    const retrySec = Math.ceil((existing.resetAt - now) / 1000);
    throw new HttpError(429, `Too many requests. Retry in ${retrySec}s.`);
  }
}

// Convenience: rate-limit an auth attempt by IP (10 attempts / 5 min).
export function rateLimitAuth(req: IncomingMessage, route: string): void {
  rateLimit(`auth:${route}:${clientIp(req)}`, 10, 5 * 60_000);
}

// Test-only: reset all buckets between tests.
export function __resetRateLimits(): void {
  buckets.clear();
  lastSweep = Date.now();
}
