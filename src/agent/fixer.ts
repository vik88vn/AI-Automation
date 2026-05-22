import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const execAsync = promisify(exec);
import {
  createProvider,
  type ProviderConfig,
  type ChatMessage,
  type ToolDef,
  type LLMProvider,
  type ChatBlock,
} from "./llm.js";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface FixRequest {
  bug: {
    id: string;
    title: string;
    severity: string;
    description: string;
    reproSteps: string[];
    expected: string;
    actual: string;
    url: string;
    evidence?: {
      error: string;
      stackTrace?: string;
      errorType?: string;
    };
  };
  projectRoot: string;
  provider: ProviderConfig;
  targetUrl: string;
  /**
   * Command to restart the target app after patching files. Run from
   * `projectRoot`. If omitted, the agent attempts to auto-detect via
   * `package.json` `scripts.start` field. Examples: `"npm start"`,
   * `"node server.js"`, `"npm run dev"`.
   */
  restartCommand?: string;
  /**
   * Whether to skip restart (e.g. for apps with hot-reload like nodemon
   * or webpack-dev-server). Default false.
   */
  skipRestart?: boolean;
  onEvent?: (event: FixEvent) => void;
}

export interface FixEvent {
  type:
    | "fix_start"
    | "fix_analyzing"
    | "fix_patching"
    | "fix_restarting"
    | "fix_verifying"
    | "fix_done"
    | "fix_error";
  timestamp: string;
  message: string;
  data?: unknown;
}

export interface FixResult {
  ok: boolean;
  bugId: string;
  patchedFiles: Array<{ path: string; diff: string }>;
  verified: boolean;
  message: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Path safety helper
// ──────────────────────────────────────────────────────────────────────────────

function safePath(projectRoot: string, relativePath: string): string {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path traversal blocked: "${relativePath}" resolves outside project root`
    );
  }
  return resolved;
}

// ──────────────────────────────────────────────────────────────────────────────
// File system tools (scoped to projectRoot)
// ──────────────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".next", "coverage",
  "build", ".cache", ".turbo", "__pycache__",
]);

export async function readSourceFile(
  projectRoot: string,
  relativePath: string
): Promise<string> {
  const abs = safePath(projectRoot, relativePath);
  return readFile(abs, "utf-8");
}

export async function writeSourceFile(
  projectRoot: string,
  relativePath: string,
  content: string
): Promise<void> {
  const abs = safePath(projectRoot, relativePath);
  // Ensure parent directory exists
  const dir = path.dirname(abs);
  await mkdir(dir, { recursive: true });
  await writeFile(abs, content, "utf-8");
}

export async function listDirectory(
  projectRoot: string,
  relativePath: string
): Promise<string[]> {
  const abs = safePath(projectRoot, relativePath);
  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => !SKIP_DIRS.has(e.name))
    .map((e) => (e.isDirectory() ? e.name + "/" : e.name));
}

export async function searchFiles(
  projectRoot: string,
  pattern: string
): Promise<string[]> {
  const root = path.resolve(projectRoot);
  const results: string[] = [];
  const lowerPattern = pattern.toLowerCase();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.toLowerCase().includes(lowerPattern)) {
        results.push(path.relative(root, fullPath));
      }
    }
  }

  await walk(root);
  return results;
}

/**
 * Search file CONTENTS for a string pattern. Returns matching files with
 * line numbers and the matching line text. This is the critical tool the
 * LLM needs to locate where route handlers, validation logic, etc. live.
 */
export async function grepFiles(
  projectRoot: string,
  pattern: string,
  maxResults = 30
): Promise<Array<{ file: string; line: number; text: string }>> {
  const root = path.resolve(projectRoot);
  const results: Array<{ file: string; line: number; text: string }> = [];
  const lowerPattern = pattern.toLowerCase();

  // Only search text-like source files
  const textExts = new Set([
    ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
    ".html", ".css", ".json", ".yml", ".yaml",
    ".py", ".rb", ".go", ".rs", ".java",
    ".md", ".txt", ".env", ".toml", ".cfg",
    ".vue", ".svelte", ".php", ".sql",
  ]);

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!textExts.has(ext)) continue;
        try {
          const content = await readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(lowerPattern)) {
              results.push({
                file: path.relative(root, fullPath),
                line: i + 1,
                text: lines[i].trim().slice(0, 200),
              });
              if (results.length >= maxResults) return;
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walk(root);
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM tool definitions for the fix agent
// ──────────────────────────────────────────────────────────────────────────────

const FIX_TOOLS: ToolDef[] = [
  {
    name: "read_file",
    description:
      "Read a source file from the project. Returns the full file contents.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path from project root (e.g. 'server.js', 'src/routes/admin.js')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a source file in the project. Creates or overwrites the file. You MUST include the ENTIRE file content, not just the changed part.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path from project root",
        },
        content: {
          type: "string",
          description: "The FULL file content to write (entire file, not a patch)",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description:
      "List files and subdirectories in a project directory. Directories have a trailing slash. Skips node_modules, .git, dist, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "Relative path from project root (use '.' for the root itself)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description:
      "Search for files whose NAMES contain the given pattern (case-insensitive substring). Good for finding files like 'server', 'login', 'admin'.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description:
            "Substring to match against filenames (e.g. 'login', 'server', 'route')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description:
      "Search file CONTENTS for a string pattern. Returns matching files with line numbers. This is the best way to find where specific routes, functions, variables, or error messages are defined.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description:
            "Text to search for in file contents (e.g. '/api/admin', 'password', 'app.post', 'required')",
        },
      },
      required: ["pattern"],
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// FixAgent
// ──────────────────────────────────────────────────────────────────────────────

const MAX_FIX_STEPS = 20;

export class FixAgent {
  private readonly provider: LLMProvider;
  private readonly projectRoot: string;
  private readonly onEvent?: (event: FixEvent) => void;

  constructor(private readonly request: FixRequest) {
    this.provider = createProvider(request.provider);
    this.projectRoot = path.resolve(request.projectRoot);
    this.onEvent = request.onEvent;
  }

  private emit(
    type: FixEvent["type"],
    message: string,
    data?: unknown
  ): void {
    const event: FixEvent = {
      type,
      timestamp: new Date().toISOString(),
      message,
      data,
    };
    // eslint-disable-next-line no-console
    console.log(`[FixAgent] ${type}: ${message}`);
    this.onEvent?.(event);
  }

  async run(): Promise<FixResult> {
    const { bug } = this.request;

    this.emit("fix_start", `Starting fix for bug ${bug.id}: ${bug.title}`);

    // 1. Analyze + patch via LLM agentic loop
    let patchedFiles: Array<{ path: string; diff: string }>;
    try {
      this.emit(
        "fix_analyzing",
        "Analyzing bug report and exploring project source files"
      );
      patchedFiles = await this.analyzeAndPatch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("fix_error", `Analysis/patch failed: ${message}`);
      return {
        ok: false,
        bugId: bug.id,
        patchedFiles: [],
        verified: false,
        message: `Fix failed during analysis: ${message}`,
      };
    }

    if (patchedFiles.length === 0) {
      this.emit("fix_error", "LLM did not write any files — no fix applied");
      return {
        ok: false,
        bugId: bug.id,
        patchedFiles: [],
        verified: false,
        message: "LLM was unable to identify or apply a fix",
      };
    }

    // 2. Restart the target app so the patches take effect
    if (!this.request.skipRestart) {
      try {
        await this.restartTargetApp();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit(
          "fix_restarting",
          `Restart skipped or failed: ${message}. Fix may still be on disk.`
        );
      }
    } else {
      this.emit(
        "fix_restarting",
        "Skipping restart (skipRestart=true). Hot-reload should pick up changes."
      );
    }

    // 3. Verify
    this.emit(
      "fix_verifying",
      `Verifying fix against ${this.request.targetUrl}`
    );
    let verified = false;
    let verifyMessage = "";
    try {
      const verification = await this.verify();
      verified = verification.ok;
      verifyMessage = verification.message;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      verifyMessage = `Verification error: ${message}`;
    }

    const resultMessage = verified
      ? `Fix applied and verified. Patched ${patchedFiles.length} file(s): ${patchedFiles.map((f) => f.path).join(", ")}`
      : `Fix applied (${patchedFiles.length} file(s): ${patchedFiles.map((f) => f.path).join(", ")}) but verification ${verifyMessage ? "noted: " + verifyMessage : "could not confirm the fix"}`;

    this.emit("fix_done", resultMessage, { patchedFiles, verified });

    return {
      ok: true,
      bugId: bug.id,
      patchedFiles,
      verified,
      message: resultMessage,
    };
  }

  // ── LLM agentic loop: analyze the bug + write patches ──────────────────

  private async analyzeAndPatch(): Promise<
    Array<{ path: string; diff: string }>
  > {
    const { bug } = this.request;

    const systemPrompt = buildFixSystemPrompt(bug);

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Fix this bug. Follow these steps:\n\n" +
              "1. Run `grep` to search for the route/endpoint mentioned in the bug URL (e.g. grep for '/api/admin' or '/login' or 'password')\n" +
              "2. Run `list_dir` on '.' to see the project structure\n" +
              "3. Read the files you found with `read_file`\n" +
              "4. Identify the root cause\n" +
              "5. Write the fixed file with `write_file` (include the ENTIRE file content)\n\n" +
              "When done, respond with text starting with 'DONE:' and summarize what you changed.",
          },
        ],
      },
    ];

    const patchedFiles: Array<{ path: string; diff: string }> = [];
    const originalContents = new Map<string, string>();

    for (let step = 0; step < MAX_FIX_STEPS; step++) {
      // eslint-disable-next-line no-console
      console.log(`[FixAgent] Step ${step + 1}/${MAX_FIX_STEPS}`);

      const response = await this.provider.chat({
        system: systemPrompt,
        tools: FIX_TOOLS,
        messages,
        maxTokens: 8192,
      });

      if (response.content.length > 0) {
        messages.push({ role: "assistant", content: response.content });
      }

      // Log any text the LLM says
      for (const block of response.content) {
        if (block.type === "text") {
          // eslint-disable-next-line no-console
          console.log(`[FixAgent] LLM says: ${(block as { text: string }).text.slice(0, 200)}`);

          // Check if the LLM signaled it's done
          if ((block as { text: string }).text.startsWith("DONE:")) {
            // eslint-disable-next-line no-console
            console.log("[FixAgent] LLM signaled DONE");
            return patchedFiles;
          }
        }
      }

      if (
        response.stopReason === "end_turn" ||
        response.stopReason === "max_tokens"
      ) {
        // eslint-disable-next-line no-console
        console.log(`[FixAgent] Stop reason: ${response.stopReason}`);
        break;
      }

      // Process tool calls
      const toolUses = response.content.filter(
        (b): b is ChatBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      if (toolUses.length === 0) {
        break;
      }

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];

      for (const tu of toolUses) {
        const input = (tu.input ?? {}) as Record<string, unknown>;
        let result: string;

        // eslint-disable-next-line no-console
        console.log(`[FixAgent] Tool: ${tu.name}(${JSON.stringify(input).slice(0, 100)})`);

        try {
          switch (tu.name) {
            case "read_file": {
              const filePath = input.path as string;
              const content = await readSourceFile(
                this.projectRoot,
                filePath
              );
              if (!originalContents.has(filePath)) {
                originalContents.set(filePath, content);
              }
              result = content;
              this.emit("fix_analyzing", `Read ${filePath} (${content.length} chars)`);
              break;
            }

            case "write_file": {
              const filePath = input.path as string;
              const content = input.content as string;

              if (!originalContents.has(filePath)) {
                try {
                  const orig = await readSourceFile(
                    this.projectRoot,
                    filePath
                  );
                  originalContents.set(filePath, orig);
                } catch {
                  originalContents.set(filePath, "");
                }
              }

              this.emit("fix_patching", `Writing fix to ${filePath}`);
              await writeSourceFile(this.projectRoot, filePath, content);

              const original = originalContents.get(filePath) ?? "";
              const diff = createSimpleDiff(original, content);
              patchedFiles.push({ path: filePath, diff });

              // eslint-disable-next-line no-console
              console.log(`[FixAgent] WROTE ${filePath} (${content.length} chars, diff: ${diff.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-")).length} changed lines)`);

              result = `File written successfully: ${filePath} (${content.length} chars)`;
              break;
            }

            case "list_dir": {
              const dirPath = (input.path as string) ?? ".";
              const entries = await listDirectory(this.projectRoot, dirPath);
              result = entries.join("\n") || "(empty directory)";
              break;
            }

            case "search_files": {
              const pattern = input.pattern as string;
              const files = await searchFiles(this.projectRoot, pattern);
              result =
                files.length > 0
                  ? files.join("\n")
                  : `No files found matching "${pattern}"`;
              break;
            }

            case "grep": {
              const pattern = input.pattern as string;
              const matches = await grepFiles(this.projectRoot, pattern);
              if (matches.length === 0) {
                result = `No matches found for "${pattern}"`;
              } else {
                result = matches
                  .map((m) => `${m.file}:${m.line}: ${m.text}`)
                  .join("\n");
              }
              break;
            }

            default:
              result = `Unknown tool: ${tu.name}`;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result = `Error: ${message}`;
          // eslint-disable-next-line no-console
          console.log(`[FixAgent] Tool error: ${message}`);
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return patchedFiles;
  }

  // ── Auto-restart target app so patches take effect ──────────────────────

  /**
   * Restart the target app:
   *   1. Find the port from `targetUrl`.
   *   2. Kill any process listening on that port (the old test app instance).
   *   3. Run the restart command (configured or auto-detected) from
   *      `projectRoot` as a detached background process.
   *   4. Poll the port until the new instance is listening (up to 15s).
   *
   * The restart command runs detached and unref'd so it survives the
   * fix request's lifetime. Stdout/stderr are inherited so the user can
   * see startup logs in the backend terminal.
   */
  private async restartTargetApp(): Promise<void> {
    const targetUrl = this.request.targetUrl;
    const port = portFromUrl(targetUrl);
    if (!port) {
      this.emit(
        "fix_restarting",
        `Cannot determine port from targetUrl ${targetUrl}; skipping restart`
      );
      return;
    }

    // Resolve the restart command.
    const command = this.request.restartCommand?.trim() || (await this.detectRestartCommand());
    if (!command) {
      this.emit(
        "fix_restarting",
        `No restart command configured and could not auto-detect from package.json. Skipping restart — restart your app manually.`
      );
      return;
    }

    this.emit("fix_restarting", `Killing process on port ${port} and running: ${command}`);

    // 1. Kill the old process listening on the target port. Best-effort —
    //    if nothing is listening, lsof returns no PIDs and the kill is a no-op.
    try {
      const { stdout } = await execAsync(
        `lsof -iTCP:${port} -sTCP:LISTEN -t || true`,
        { timeout: 5000 }
      );
      const pids = stdout.trim().split(/\s+/).filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), "SIGKILL");
          // eslint-disable-next-line no-console
          console.log(`[FixAgent] Killed PID ${pid} on port ${port}`);
        } catch {
          // process may have already exited
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[FixAgent] Port-kill step skipped: ${err instanceof Error ? err.message : err}`);
    }

    // Brief pause so the OS releases the port before we relaunch.
    await new Promise((r) => setTimeout(r, 500));

    // 2. Spawn the restart command as a detached background process.
    //    `shell: true` lets the user write `npm start` rather than splitting argv.
    const child = spawn(command, {
      cwd: this.projectRoot,
      shell: true,
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // 3. Poll the URL until it responds (up to 15 seconds).
    const deadline = Date.now() + 15_000;
    let lastError = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(targetUrl, {
          // Don't follow redirects — we just want to know the port answers.
          redirect: "manual",
        });
        // Any HTTP response (even 4xx/5xx) means the server is up.
        if (res.status > 0) {
          this.emit(
            "fix_restarting",
            `Target app responded with HTTP ${res.status}. Waiting briefly for full readiness…`
          );
          // Small extra settle so async startup work completes.
          await new Promise((r) => setTimeout(r, 1000));
          return;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    throw new Error(
      `Target app did not respond on ${targetUrl} within 15s after restart. Last error: ${lastError}`
    );
  }

  /**
   * Auto-detect a restart command by reading `package.json` in the project
   * root. Returns `npm start` if a `start` script exists, otherwise null.
   */
  private async detectRestartCommand(): Promise<string | null> {
    try {
      const pkgPath = path.join(this.projectRoot, "package.json");
      const content = await readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
      if (pkg.scripts?.start) {
        return "npm start";
      }
      if (pkg.scripts?.dev) {
        return "npm run dev";
      }
    } catch {
      // package.json missing or unparseable
    }
    return null;
  }

  // ── Playwright verification ─────────────────────────────────────────────

  private async verify(): Promise<{ ok: boolean; message: string }> {
    const { bug } = this.request;
    const targetUrl = this.request.targetUrl;

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page: Page = await context.newPage();
      page.setDefaultTimeout(15_000);

      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text().slice(0, 500));
        }
      });

      page.on("response", (resp) => {
        if (resp.status() >= 500) {
          networkErrors.push(`${resp.status()} ${resp.url()}`);
        }
      });

      const navUrl = bug.url.startsWith("http") ? bug.url : targetUrl;
      const response = await page.goto(navUrl, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      const httpStatus = response?.status() ?? 0;
      const pageTitle = await page.title();

      const hasPageError = httpStatus >= 500;
      const hasNetworkErrors = networkErrors.length > 0;
      const hasConsoleErrors = consoleErrors.length > 0;

      await context.close();

      if (hasPageError) {
        return {
          ok: false,
          message: `Page returned HTTP ${httpStatus} at ${navUrl}`,
        };
      }

      if (hasNetworkErrors) {
        return {
          ok: false,
          message: `Server errors during page load: ${networkErrors.join("; ")}`,
        };
      }

      if (hasConsoleErrors) {
        return {
          ok: true,
          message: `Page loaded (title: "${pageTitle}") but console errors present: ${consoleErrors.slice(0, 3).join("; ")}`,
        };
      }

      return {
        ok: true,
        message: `Page loaded successfully (HTTP ${httpStatus}, title: "${pageTitle}")`,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Extract the port from a URL. Falls back to default ports (80 for http, 443
 * for https) when the URL doesn't carry an explicit port.
 */
function portFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    if (u.port) return parseInt(u.port, 10);
    if (u.protocol === "http:") return 80;
    if (u.protocol === "https:") return 443;
    return null;
  } catch {
    return null;
  }
}

function buildFixSystemPrompt(bug: FixRequest["bug"]): string {
  const evidenceBlock = bug.evidence
    ? [
        "",
        "Error evidence:",
        `  error: ${bug.evidence.error}`,
        bug.evidence.errorType
          ? `  errorType: ${bug.evidence.errorType}`
          : null,
        bug.evidence.stackTrace
          ? `  stackTrace:\n${bug.evidence.stackTrace}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  // Extract route path from the bug URL to help the LLM focus
  let routeHint = "";
  try {
    const u = new URL(bug.url);
    routeHint = `\n\nROUTE HINT: The bug is at URL path "${u.pathname}". Grep for this path or related route handler.`;
  } catch {
    // invalid URL, skip hint
  }

  return `You are a senior software engineer fixing a bug in a web application.

BUG REPORT:
  ID: ${bug.id}
  Title: ${bug.title}
  Severity: ${bug.severity}
  Description: ${bug.description}
  URL: ${bug.url}
  Expected: ${bug.expected}
  Actual: ${bug.actual}
  Repro steps:
${bug.reproSteps.map((s, i) => `    ${i + 1}. ${s}`).join("\n")}
${evidenceBlock}${routeHint}

AVAILABLE TOOLS:
  - read_file: Read a source file (relative path from project root)
  - write_file: Write ENTIRE file content to a source file
  - list_dir: List directory contents ('.' for project root)
  - search_files: Find files by filename substring
  - grep: Search file CONTENTS for a string — this is the most important tool for finding where code lives

STRATEGY:
  1. FIRST: Use \`grep\` to find where the relevant route/endpoint/function is defined.
     Example: grep for "/api/admin" or "login" or "password" or "products"
  2. THEN: Use \`list_dir\` on '.' to understand the project structure.
  3. THEN: Use \`read_file\` to read the files you found.
  4. THEN: Identify the root cause and apply a MINIMAL fix.
  5. FINALLY: Use \`write_file\` with the COMPLETE corrected file content.

RULES:
  - Use grep FIRST to find the right files — don't guess filenames.
  - When you write_file, include the ENTIRE file, not just changed lines.
  - Do NOT introduce new dependencies.
  - Do NOT refactor unrelated code.
  - Keep changes minimal — fix the specific bug only.
  - When done, respond with text starting with "DONE:" summarizing changes.`;
}

function createSimpleDiff(original: string, updated: string): string {
  const oldLines = original.split("\n");
  const newLines = updated.split("\n");

  const lines: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      lines.push(` ${oldLine}`);
    } else {
      if (oldLine !== undefined) lines.push(`-${oldLine}`);
      if (newLine !== undefined) lines.push(`+${newLine}`);
    }
  }

  // Collapse context: only show lines near changes
  const diffLines: string[] = [];
  const isChange = (line: string) =>
    line.startsWith("+") || line.startsWith("-");

  for (let i = 0; i < lines.length; i++) {
    const nearChange =
      isChange(lines[i]) ||
      (i > 0 && isChange(lines[i - 1])) ||
      (i > 1 && isChange(lines[i - 2])) ||
      (i > 2 && isChange(lines[i - 3])) ||
      (i < lines.length - 1 && isChange(lines[i + 1])) ||
      (i < lines.length - 2 && isChange(lines[i + 2])) ||
      (i < lines.length - 3 && isChange(lines[i + 3]));

    if (nearChange) {
      diffLines.push(lines[i]);
    } else if (
      diffLines.length > 0 &&
      diffLines[diffLines.length - 1] !== "..."
    ) {
      diffLines.push("...");
    }
  }

  return diffLines.join("\n");
}
