#!/usr/bin/env node
import "dotenv/config";
import { runDeepAgent } from "./agent.js";
import { resolveProviderConfig, type ProviderName } from "./llm.js";

interface Args {
  url?: string;
  maxSteps: number;
  headless: boolean;
  reportDir: string;
  provider?: ProviderName | "auto";
  model?: string;
  ollamaBaseUrl?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    maxSteps: 40,
    headless: true,
    reportDir: "./reports",
  };
  for (const a of argv) {
    if (a.startsWith("--url=")) args.url = a.slice("--url=".length);
    else if (a.startsWith("--max-steps=")) args.maxSteps = Number(a.slice("--max-steps=".length));
    else if (a === "--no-headless") args.headless = false;
    else if (a.startsWith("--report-dir=")) args.reportDir = a.slice("--report-dir=".length);
    else if (a.startsWith("--provider=")) {
      const v = a.slice("--provider=".length) as Args["provider"];
      args.provider = v;
    } else if (a.startsWith("--model=")) args.model = a.slice("--model=".length);
    else if (a.startsWith("--ollama-url=")) args.ollamaBaseUrl = a.slice("--ollama-url=".length);
    else if (!a.startsWith("--") && !args.url) args.url = a;
  }
  if (!args.url) args.url = process.env.QA_TARGET_URL;
  return args;
}

function help(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage: agent <url> [options]

Options:
  --url=<url>              Target application URL (or pass positionally). Localhost works.
  --max-steps=<n>          Hard ceiling on agent iterations (default 40)
  --no-headless            Show the browser window
  --report-dir=<path>      Where reports + screenshots are written (default ./reports)
  --provider=<name>        anthropic | openai | ollama | auto (default: auto)
  --model=<id>             Override the model id for the chosen provider
  --ollama-url=<url>       Ollama base URL (default http://localhost:11434)

Provider selection (auto):
  1. ANTHROPIC_API_KEY → Anthropic
  2. OPENAI_API_KEY    → OpenAI
  3. otherwise         → Ollama (local, no key required)

Env vars:
  ANTHROPIC_API_KEY, OPENAI_API_KEY, OLLAMA_BASE_URL, OLLAMA_MODEL, QA_TARGET_URL`);
}

function normalizeUrl(input: string): string {
  let u = input.trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[?fe80)/i.test(u);
    u = (isLocal ? "http://" : "https://") + u;
  }
  return u;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    help();
    return;
  }
  const args = parseArgs(argv);
  if (!args.url) {
    help();
    process.exitCode = 1;
    return;
  }
  const url = normalizeUrl(args.url);

  let providerConfig;
  try {
    providerConfig = resolveProviderConfig({
      preferred: args.provider ?? "auto",
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      anthropicModel: args.provider === "anthropic" ? args.model : undefined,
      openaiKey: process.env.OPENAI_API_KEY,
      openaiModel: args.provider === "openai" ? args.model : undefined,
      ollamaModel:
        args.provider === "ollama" || args.provider === "auto"
          ? args.model ?? process.env.OLLAMA_MODEL
          : process.env.OLLAMA_MODEL,
      ollamaBaseUrl: args.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Starting deep agent against ${url} (provider=${providerConfig.provider}, maxSteps=${args.maxSteps})`
  );
  const result = await runDeepAgent({
    url,
    provider: providerConfig,
    maxSteps: args.maxSteps,
    headless: args.headless,
    reportDir: args.reportDir,
    onEvent: (e) => {
      // eslint-disable-next-line no-console
      console.log(`[${e.type}] step=${e.step} ${JSON.stringify(e.payload).slice(0, 240)}`);
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `\nDone. steps=${result.steps} stop=${result.stoppedReason} tests=${result.tests.length} bugs=${result.bugs.length}`
  );
  // eslint-disable-next-line no-console
  console.log(`Reports: ${result.reportJsonPath} / ${result.reportMdPath}`);
}

void main();
