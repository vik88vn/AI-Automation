// ─────────────────────────────────────────────────────────────────────────────
// API client — talks to the deep-agent backend via the Vite proxy (/api/*).
//
// Two operations:
//   - startRun(opts)         → POST /api/runs               returns { id }
//   - subscribeToRun(id, …)  → EventSource /api/runs/:id/stream
//
// Provider settings come from localStorage (same key the HTML dashboard
// uses), so a key set there carries over. If absent, the backend's
// resolver falls back to env vars, then Ollama.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentEvent } from "./agentEvents";

const SETTINGS_KEY = "ai-qa-deep-agent.settings.v1";

export interface ProviderSettings {
  preferred?: "auto" | "anthropic" | "openai" | "ollama";
  anthropicKey?: string;
  anthropicModel?: string;
  openaiKey?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

export interface StartRunOptions {
  url: string;
  maxSteps?: number;
  headless?: boolean;
  providerSettings?: ProviderSettings;
}

export interface StartRunResponse {
  id: string;
  url: string;
  startedAt: string;
  provider: string;
}

function readSettings(): ProviderSettings | undefined {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ProviderSettings;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function startRun(opts: StartRunOptions): Promise<StartRunResponse> {
  const body: StartRunOptions = {
    url: opts.url,
    maxSteps: opts.maxSteps ?? 40,
    headless: opts.headless ?? true,
    providerSettings: opts.providerSettings ?? readSettings(),
  };
  const res = await fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err.error ?? "";
    } catch {
      // ignore
    }
    throw new Error(detail || `Backend HTTP ${res.status}`);
  }
  return (await res.json()) as StartRunResponse;
}

export interface SubscribeHandlers {
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
  onError?: (err: Event) => void;
}

/**
 * Open an SSE stream for a run. Returns a closer the caller can invoke when
 * the user navigates away or starts a new run.
 *
 * The backend emits a `done` event when the run finishes (which closes the
 * connection from its side); we still expose `onDone` so the caller can
 * trigger UI cleanup.
 */
export function subscribeToRun(id: string, handlers: SubscribeHandlers): () => void {
  const es = new EventSource(`/api/runs/${id}/stream`);

  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as AgentEvent;
      handlers.onEvent(event);
    } catch {
      // malformed event; skip silently
    }
  };

  es.addEventListener("done", () => {
    handlers.onDone?.();
    es.close();
  });

  es.onerror = (err) => {
    handlers.onError?.(err);
    es.close();
  };

  return () => {
    es.close();
  };
}

/**
 * Quick reachability check used by the UI to decide whether to show
 * "backend offline" feedback before attempting to start a run.
 */
export async function pingBackend(): Promise<boolean> {
  try {
    const res = await fetch("/api/runs", { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
