// ─────────────────────────────────────────────────────────────────────────
// Dashboard API client — talks to the multi-tenant SaaS endpoints.
//
// Auth: a JWT access token is stored in localStorage under AUTH_KEY (set by
// the login flow). authedFetch attaches it as a Bearer header. All requests go
// through the /api proxy (dev) or VITE_API_TARGET (prod), same as lib/api.ts.
// ─────────────────────────────────────────────────────────────────────────

import { apiUrl, accessHeaders } from "./apiBase";

const AUTH_KEY = "ai-qa-deep-agent.auth.v1";

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens).accessToken : null;
  } catch {
    return null;
  }
}

export function setAuthTokens(tokens: AuthTokens): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(tokens));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...accessHeaders(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // non-JSON error
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

// ── Types mirrored from the backend metrics routes ───────────────────────

export interface ProjectMetrics {
  totalBugs: number;
  totalRuns: number;
  passRate: number | null;
  tests: { total: number; passed: number; failed: number };
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface TrendPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}
export interface TrendsResponse {
  days: number;
  series: TrendPoint[];
}

export interface ActivityResponse {
  recentRuns: Array<{
    id: string;
    url: string;
    status: string;
    createdAt: string;
    testsTotal: number;
    testsPassed: number;
    testsFailed: number;
    user: { id: string; email: string; firstName: string | null };
  }>;
  recentComments: Array<{
    id: string;
    text: string;
    createdAt: string;
    author: { email: string; firstName: string | null };
    bug: { id: string; title: string };
  }>;
  leaderboard: Array<{ user: { email: string; firstName: string | null } | null; count: number }>;
}

// ── API functions ─────────────────────────────────────────────────────────

export const fetchMetrics = (projectId: string) =>
  authedFetch<ProjectMetrics>(`/api/projects/${projectId}/metrics`);

export const fetchTrends = (projectId: string, days = 30) =>
  authedFetch<TrendsResponse>(`/api/projects/${projectId}/trends?days=${days}`);

export const fetchActivity = (projectId: string) =>
  authedFetch<ActivityResponse>(`/api/projects/${projectId}/activity`);

// Export endpoints return files; build a URL the browser can open/download.
export const exportRunUrl = (runId: string, format: "csv" | "html") =>
  apiUrl(`/api/runs/${runId}/export?format=${format}`);

export const postRunToSlack = (runId: string) =>
  authedFetch<{ ok: boolean }>(`/api/runs/${runId}/slack`, { method: "POST" });

export const createBugJira = (bugId: string) =>
  authedFetch<{ jira: { key: string; url: string } }>(`/api/bugs/${bugId}/jira`, { method: "POST" });

// Auth
export const login = (email: string, password: string) =>
  authedFetch<{ user: unknown; accessToken: string; refreshToken: string }>(`/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const signup = (email: string, password: string, firstName?: string, lastName?: string) =>
  authedFetch<{ user: unknown; accessToken: string; refreshToken: string }>(`/api/auth/signup`, {
    method: "POST",
    body: JSON.stringify({ email, password, firstName, lastName }),
  });
