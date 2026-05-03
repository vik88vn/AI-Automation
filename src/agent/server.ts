import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDeepAgent } from "./agent.js";
import { resolveProviderConfig, type ProviderResolverInput } from "./llm.js";
import type { AgentEvent, AgentRunResult } from "./types.js";

interface ActiveRun {
  id: string;
  url: string;
  startedAt: string;
  events: AgentEvent[];
  subscribers: Set<ServerResponse>;
  result?: AgentRunResult;
  done: boolean;
  error?: string;
}

const runs = new Map<string, ActiveRun>();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function broadcast(run: ActiveRun, event: AgentEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const sub of run.subscribers) {
    try {
      sub.write(data);
    } catch {
      run.subscribers.delete(sub);
    }
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function serveDashboard(res: ServerResponse): Promise<void> {
  const htmlPath = path.join(__dirname, "dashboard.html");
  try {
    const html = await readFile(htmlPath, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`Failed to load dashboard.html: ${(err as Error).message}`);
  }
}

interface StartRunBody {
  url?: string;
  maxSteps?: number;
  headless?: boolean;
  providerSettings?: ProviderResolverInput;
}

function normalizeUrl(input: string): string {
  let u = input.trim();
  if (!u) return u;
  // Accept bare hosts like "localhost:3000"; default to http for localhost, https otherwise.
  if (!/^https?:\/\//i.test(u)) {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[?fe80)/i.test(u);
    u = (isLocal ? "http://" : "https://") + u;
  }
  return u;
}

async function startRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let parsed: StartRunBody;
  try {
    parsed = body ? (JSON.parse(body) as StartRunBody) : {};
  } catch {
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const url = normalizeUrl(parsed.url ?? "");
  if (!url) {
    sendJson(res, 400, { error: "url is required" });
    return;
  }

  // Settings from the request body win; fall back to server-side env vars so
  // either the dashboard's settings panel or a .env config can drive the agent.
  const settings: ProviderResolverInput = {
    preferred: parsed.providerSettings?.preferred ?? "auto",
    anthropicKey: parsed.providerSettings?.anthropicKey ?? process.env.ANTHROPIC_API_KEY,
    anthropicModel: parsed.providerSettings?.anthropicModel,
    openaiKey: parsed.providerSettings?.openaiKey ?? process.env.OPENAI_API_KEY,
    openaiModel: parsed.providerSettings?.openaiModel,
    ollamaModel: parsed.providerSettings?.ollamaModel ?? process.env.OLLAMA_MODEL,
    ollamaBaseUrl: parsed.providerSettings?.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL,
  };

  let providerConfig;
  try {
    providerConfig = resolveProviderConfig(settings);
  } catch (err) {
    sendJson(res, 400, {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const id = `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const run: ActiveRun = {
    id,
    url,
    startedAt: new Date().toISOString(),
    events: [],
    subscribers: new Set(),
    done: false,
  };
  runs.set(id, run);

  // Fire and forget — events stream via SSE.
  void (async () => {
    try {
      const result = await runDeepAgent({
        url,
        provider: providerConfig,
        maxSteps: parsed.maxSteps ?? 50,
        headless: parsed.headless ?? true,
        reportDir: path.resolve("./reports"),
        onEvent: (event) => {
          run.events.push(event);
          broadcast(run, event);
        },
      });
      run.result = result;
      run.done = true;
    } catch (err) {
      run.error = err instanceof Error ? err.message : String(err);
      run.done = true;
      broadcast(run, {
        type: "run_error",
        timestamp: new Date().toISOString(),
        step: 0,
        payload: { error: run.error },
      });
    } finally {
      // Final closing event so SSE clients can detach.
      const closer = `event: done\ndata: ${JSON.stringify({ id, ok: !run.error })}\n\n`;
      for (const sub of run.subscribers) {
        try {
          sub.write(closer);
          sub.end();
        } catch {
          // ignore
        }
      }
      run.subscribers.clear();
    }
  })();

  sendJson(res, 200, {
    id,
    url,
    startedAt: run.startedAt,
    provider: providerConfig.provider,
  });
}

function streamRun(req: IncomingMessage, res: ServerResponse, id: string): void {
  const run = runs.get(id);
  if (!run) {
    sendJson(res, 404, { error: "run not found" });
    return;
  }
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  // Flush all buffered events first so late subscribers catch up.
  for (const e of run.events) {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  }
  if (run.done) {
    res.write(`event: done\ndata: ${JSON.stringify({ id })}\n\n`);
    res.end();
    return;
  }
  run.subscribers.add(res);
  req.on("close", () => {
    run.subscribers.delete(res);
  });
}

function getRunSummary(res: ServerResponse, id: string): void {
  const run = runs.get(id);
  if (!run) {
    sendJson(res, 404, { error: "run not found" });
    return;
  }
  sendJson(res, 200, {
    id: run.id,
    url: run.url,
    startedAt: run.startedAt,
    done: run.done,
    error: run.error ?? null,
    events: run.events.length,
    result: run.result
      ? {
          stoppedReason: run.result.stoppedReason,
          steps: run.result.steps,
          model: run.result.model,
          tests: run.result.tests,
          bugs: run.result.bugs,
          analysis: run.result.analysis ?? null,
          reportJsonPath: run.result.reportJsonPath,
          reportMdPath: run.result.reportMdPath,
        }
      : null,
  });
}

function listRuns(res: ServerResponse): void {
  sendJson(res, 200, {
    runs: [...runs.values()].map((r) => ({
      id: r.id,
      url: r.url,
      startedAt: r.startedAt,
      done: r.done,
      events: r.events.length,
    })),
  });
}

export function startServer(port = 4310): void {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const route = url.pathname;

    if (req.method === "GET" && (route === "/" || route === "/index.html")) {
      void serveDashboard(res);
      return;
    }
    if (req.method === "POST" && route === "/api/runs") {
      void startRun(req, res);
      return;
    }
    if (req.method === "GET" && route === "/api/runs") {
      listRuns(res);
      return;
    }
    const streamMatch = route.match(/^\/api\/runs\/([^/]+)\/stream$/);
    if (req.method === "GET" && streamMatch) {
      streamRun(req, res, streamMatch[1]);
      return;
    }
    const summaryMatch = route.match(/^\/api\/runs\/([^/]+)$/);
    if (req.method === "GET" && summaryMatch) {
      getRunSummary(res, summaryMatch[1]);
      return;
    }
    if (req.method === "GET" && route === "/health") {
      sendJson(res, 200, {
        ok: true,
        env: {
          anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
          openai: Boolean(process.env.OPENAI_API_KEY),
          ollamaUrl: process.env.OLLAMA_BASE_URL ?? null,
          ollamaModel: process.env.OLLAMA_MODEL ?? null,
        },
      });
      return;
    }
    sendJson(res, 404, { error: "not found", path: route });
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`AI QA deep-agent dashboard: http://localhost:${port}`);
  });
}
