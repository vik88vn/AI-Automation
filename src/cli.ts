import "dotenv/config";
import { runQa } from "./orchestrator.js";
import type { QAOptions } from "./types.js";

interface CliArgs {
  url?: string;
  headless?: boolean;
  maxDepth?: number;
  maxPages?: number;
  testTimeoutMs?: number;
  reportDir?: string;
  model?: string;
  minTestCases?: number;
  maxTestCases?: number;
  help?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--no-headless") {
      args.headless = false;
      continue;
    }
    if (!arg.startsWith("--")) {
      if (!args.url) args.url = arg;
      continue;
    }
    const [keyRaw, valueInline] = arg.slice(2).split("=", 2);
    const value = valueInline ?? argv[++i];
    if (value === undefined) continue;
    switch (keyRaw) {
      case "url":
        args.url = value;
        break;
      case "max-depth":
        args.maxDepth = Number(value);
        break;
      case "max-pages":
        args.maxPages = Number(value);
        break;
      case "test-timeout":
        args.testTimeoutMs = Number(value);
        break;
      case "report-dir":
        args.reportDir = value;
        break;
      case "model":
        args.model = value;
        break;
      case "min-tests":
        args.minTestCases = Number(value);
        break;
      case "max-tests":
        args.maxTestCases = Number(value);
        break;
      default:
        console.warn(`Unknown flag: --${keyRaw}`);
    }
  }
  return args;
}

function help(): void {
  const text = `
AI QA Engineer

Usage:
  npm run qa -- <url> [options]
  npm run qa -- --url=<url> [options]

Options:
  --url=<url>             Target URL (or pass as positional argument)
  --max-depth=<n>         Max crawl depth, 1-5 (default: 3)
  --max-pages=<n>         Max pages to visit (default: 12)
  --test-timeout=<ms>     Per-test timeout in milliseconds (default: 30000)
  --report-dir=<path>     Output directory for reports (default: ./reports)
  --model=<id>            Claude model ID (default: claude-opus-4-7)
  --min-tests=<n>         Minimum test cases to generate (default: 10)
  --max-tests=<n>         Maximum test cases to generate (default: 15)
  --no-headless           Run browser with UI visible (debug mode)
  -h, --help              Show this help message

Environment:
  ANTHROPIC_API_KEY       Required - your Claude API key
  QA_TARGET_URL           Default URL if --url not provided

Examples:
  npm run qa -- https://example.com
  npm run qa -- --url=https://app.example.com --max-pages=8 --max-tests=12
`.trim();
  console.log(text);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }
  const url = args.url ?? process.env.QA_TARGET_URL;
  if (!url) {
    console.error("Error: missing target URL. Pass it as an argument or set QA_TARGET_URL.");
    help();
    process.exit(1);
  }

  const headless =
    args.headless ?? (process.env.QA_HEADLESS === "false" ? false : true);

  const options: QAOptions = {
    url,
    headless,
    maxDepth: args.maxDepth ?? numericEnv("QA_MAX_DEPTH"),
    maxPages: args.maxPages ?? numericEnv("QA_MAX_PAGES"),
    testTimeoutMs: args.testTimeoutMs ?? numericEnv("QA_TEST_TIMEOUT_MS"),
    reportDir: args.reportDir ?? process.env.QA_REPORT_DIR,
    model: args.model,
    minTestCases: args.minTestCases,
    maxTestCases: args.maxTestCases,
  };

  try {
    const result = await runQa(options);
    console.log("\n=== QA RUN COMPLETE ===");
    console.log(`Total:      ${result.report.summary.total}`);
    console.log(`Passed:     ${result.report.summary.passed}`);
    console.log(`Failed:     ${result.report.summary.failed}`);
    console.log(`Pass rate:  ${(result.report.summary.passRate * 100).toFixed(1)}%`);
    console.log(`Bugs:       ${result.report.bugs.length}`);
    console.log(`JSON:       ${result.jsonPath}`);
    console.log(`Markdown:   ${result.markdownPath}`);
    process.exit(result.report.summary.failed > 0 ? 1 : 0);
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error("\nQA run failed:");
    console.error(msg);
    process.exit(2);
  }
}

function numericEnv(key: string): number | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

main();
