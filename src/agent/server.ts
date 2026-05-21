import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDeepAgent } from "./agent.js";
import { resolveProviderConfig, createProvider, type ProviderResolverInput } from "./llm.js";
import { FixAgent, type FixRequest, type FixEvent } from "./fixer.js";
import type { AgentEvent, AgentRunResult } from "./types.js";
import { handleAuthRoutes } from "../routes/auth.js";
import { handleProjectRoutes } from "../routes/projects.js";
import { handleBugRoutes } from "../routes/bugs.js";

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

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/chat — conversational endpoint seeded with run context
// ──────────────────────────────────────────────────────────────────────────────

interface ChatBody {
  message?: string;
  runId?: string;
  providerSettings?: ProviderResolverInput;
  context?: {
    bugs?: Array<{ id: string; title: string; severity: string; description?: string; url?: string }>;
    tests?: Array<{ id: string; title: string; status: string }>;
  };
}

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let parsed: ChatBody;
  try {
    parsed = body ? (JSON.parse(body) as ChatBody) : {};
  } catch {
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }
  const message = parsed.message?.trim();
  if (!message) {
    sendJson(res, 400, { error: "message is required" });
    return;
  }

  // Resolve provider: frontend settings win, then env vars.
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
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const provider = createProvider(providerConfig);

  // Build context summary for the LLM
  const bugs = parsed.context?.bugs ?? [];
  const tests = parsed.context?.tests ?? [];
  const bugSummary = bugs.length > 0
    ? bugs.map((b) => `- [${b.severity.toUpperCase()}] ${b.id}: ${b.title}${b.url ? ` (${b.url})` : ""}`).join("\n")
    : "No bugs found.";
  const testSummary = tests.length > 0
    ? tests.map((t) => `- ${t.id}: ${t.title} [${t.status}]`).join("\n")
    : "No tests run.";

  const systemPrompt = `You are the AI QA Engineer assistant. You just finished testing a website and found these results:

## Bugs Found
${bugSummary}

## Test Results
${testSummary}

The user is now asking you about the results. Be helpful, concise, and specific. If they ask how to fix a bug, explain the likely root cause and the code change needed. If they ask you to fix bugs, respond with actionable guidance and include which bug IDs you'd fix.

When the user asks you to fix bugs, include a JSON block at the end of your message like:
\`\`\`json
{"actions": [{"type": "fix", "bugId": "BUG_001"}]}
\`\`\`

Only include the actions block when the user explicitly asks you to fix something.`;

  try {
    const result = await provider.chat({
      system: systemPrompt,
      tools: [],
      messages: [{ role: "user", content: message }],
      maxTokens: 1024,
    });

    const replyText = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");

    // Parse actions from the reply if present
    let actions: Array<{ type: string; bugId: string }> | undefined;
    const actionsMatch = replyText.match(/```json\s*(\{[\s\S]*?"actions"[\s\S]*?\})\s*```/);
    if (actionsMatch) {
      try {
        const parsed = JSON.parse(actionsMatch[1]) as { actions?: Array<{ type: string; bugId: string }> };
        actions = parsed.actions;
      } catch {
        // ignore parse errors
      }
    }

    // Clean the reply text (remove the JSON block from display)
    const cleanReply = replyText.replace(/```json\s*\{[\s\S]*?"actions"[\s\S]*?\}\s*```/g, "").trim();

    sendJson(res, 200, { reply: cleanReply, actions });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/fix — spawn a FixAgent to patch a bug in the user's source code
// ──────────────────────────────────────────────────────────────────────────────

interface FixBody {
  bugId?: string;
  bug?: {
    id: string;
    title: string;
    severity: string;
    description: string;
    reproSteps: string[];
    expected: string;
    actual: string;
    url: string;
    evidence?: { error: string; stackTrace?: string; errorType?: string };
  };
  projectRoot?: string;
  targetUrl?: string;
  restartCommand?: string;
  skipRestart?: boolean;
  providerSettings?: ProviderResolverInput;
}

async function handleFix(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let parsed: FixBody;
  try {
    parsed = body ? (JSON.parse(body) as FixBody) : {};
  } catch {
    sendJson(res, 400, { error: "invalid JSON" });
    return;
  }

  if (!parsed.bug) {
    sendJson(res, 400, { error: "bug object is required" });
    return;
  }
  const projectRoot = parsed.projectRoot || process.env.PROJECT_ROOT;
  if (!projectRoot) {
    sendJson(res, 400, {
      error: "projectRoot is required. Set it in Settings or set the PROJECT_ROOT env var.",
    });
    return;
  }
  const targetUrl = parsed.targetUrl || parsed.bug.url;

  const settings: ProviderResolverInput = {
    preferred: parsed.providerSettings?.preferred ?? "auto",
    anthropicKey: parsed.providerSettings?.anthropicKey ?? process.env.ANTHROPIC_API_KEY,
    openaiKey: parsed.providerSettings?.openaiKey ?? process.env.OPENAI_API_KEY,
    ollamaModel: parsed.providerSettings?.ollamaModel ?? process.env.OLLAMA_MODEL,
    ollamaBaseUrl: parsed.providerSettings?.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL,
  };
  let providerConfig;
  try {
    providerConfig = resolveProviderConfig(settings);
  } catch (err) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    return;
  }

  // Stream fix events via SSE
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });

  const fixRequest: FixRequest = {
    bug: parsed.bug,
    projectRoot,
    provider: providerConfig,
    targetUrl,
    restartCommand: parsed.restartCommand,
    skipRestart: parsed.skipRestart,
    onEvent: (event: FixEvent) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // client disconnected
      }
    },
  };

  try {
    const agent = new FixAgent(fixRequest);
    const result = await agent.run();
    res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
  } catch (err) {
    const errorEvent = {
      type: "fix_error",
      timestamp: new Date().toISOString(),
      message: err instanceof Error ? err.message : String(err),
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
  } finally {
    res.end();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CORS preflight handler
// ──────────────────────────────────────────────────────────────────────────────

function handleCors(res: ServerResponse): void {
  res.writeHead(204, {
    "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
  });
  res.end();
}

export function startServer(port = 4310): void {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const route = url.pathname;

    // Handle CORS preflight for all /api routes
    if (req.method === "OPTIONS" && route.startsWith("/api")) {
      handleCors(res);
      return;
    }

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
    // Chat endpoint
    if (req.method === "POST" && route === "/api/chat") {
      void handleChat(req, res);
      return;
    }
    // Fix endpoint
    if (req.method === "POST" && route === "/api/fix") {
      void handleFix(req, res);
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

    // SaaS API routes (auth, projects, bugs). Each dispatcher returns true if
    // it handled the request; otherwise we fall through to 404. These are
    // async (DB-backed) so we run them in a sequential chain.
    void (async () => {
      try {
        if (await handleAuthRoutes(req, res, url)) return;
        if (await handleProjectRoutes(req, res, url)) return;
        if (await handleBugRoutes(req, res, url)) return;
        sendJson(res, 404, { error: "not found", path: route });
      } catch (err) {
        // Last-resort guard: a dispatcher threw before sending a response.
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Internal server error",
          });
        }
      }
    })();
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`AI QA deep-agent dashboard: http://localhost:${port}`);
  });
}
