import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
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
  onEvent?: (event: FixEvent) => void;
}

export interface FixEvent {
  type:
    | "fix_start"
    | "fix_analyzing"
    | "fix_patching"
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
  await writeFile(abs, content, "utf-8");
}

export async function listDirectory(
  projectRoot: string,
  relativePath: string
): Promise<string[]> {
  const abs = safePath(projectRoot, relativePath);
  const entries = await readdir(abs, { withFileTypes: true });
  return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
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
      return; // skip unreadable directories
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common non-source directories
      if (
        entry.isDirectory() &&
        (entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === ".next" ||
          entry.name === "coverage")
      ) {
        continue;
      }

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
          description: "Relative path from project root",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write content to a source file in the project. Creates or overwrites the file.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Relative path from project root",
        },
        content: {
          type: "string",
          description: "The full file content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description:
      "List files and subdirectories in a project directory. Directories have a trailing slash.",
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
      "Search for files whose names contain the given pattern string (case-insensitive). " +
      "Skips node_modules, .git, dist, .next, and coverage directories.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description:
            "Substring to match against filenames (e.g. 'login', '.tsx', 'route')",
        },
      },
      required: ["pattern"],
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// FixAgent
// ──────────────────────────────────────────────────────────────────────────────

const MAX_FIX_STEPS = 15;

export class FixAgent {
  private readonly provider: LLMProvider;
  private readonly projectRoot: string;
  private readonly onEvent?: (event: FixEvent) => void;

  constructor(private readonly request: FixRequest) {
    this.provider = createProvider(request.provider);
    this.projectRoot = path.resolve(request.projectRoot);
    this.onEvent = request.onEvent;
  }

  // ── Event helpers ───────────────────────────────────────────────────────

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
    this.onEvent?.(event);
  }

  // ── Public entry point ──────────────────────────────────────────────────

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
      this.emit("fix_error", "LLM could not determine a fix");
      return {
        ok: false,
        bugId: bug.id,
        patchedFiles: [],
        verified: false,
        message: "LLM was unable to identify files to patch",
      };
    }

    // 2. Verify
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
      ? `Fix applied and verified. Patched ${patchedFiles.length} file(s).`
      : `Fix applied (${patchedFiles.length} file(s)) but verification ${verifyMessage ? "noted: " + verifyMessage : "could not confirm the fix"}`;

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
              "Analyze this bug and fix it. Start by exploring the project structure " +
              "(list_dir, search_files) to locate the relevant source files, then read " +
              "them, identify the root cause, and write the corrected file(s).\n\n" +
              "When you have applied all necessary changes, respond with a final text " +
              'message starting with "DONE:" followed by a summary of what you changed.',
          },
        ],
      },
    ];

    const patchedFiles: Array<{ path: string; diff: string }> = [];
    // Track original file contents so we can produce diffs
    const originalContents = new Map<string, string>();

    for (let step = 0; step < MAX_FIX_STEPS; step++) {
      const response = await this.provider.chat({
        system: systemPrompt,
        tools: FIX_TOOLS,
        messages,
        maxTokens: 4096,
      });

      // Append assistant response
      if (response.content.length > 0) {
        messages.push({ role: "assistant", content: response.content });
      }

      // Check for end_turn — the LLM is done talking
      if (
        response.stopReason === "end_turn" ||
        response.stopReason === "max_tokens"
      ) {
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

        try {
          switch (tu.name) {
            case "read_file": {
              const filePath = input.path as string;
              const content = await readSourceFile(
                this.projectRoot,
                filePath
              );
              // Cache original for diff
              if (!originalContents.has(filePath)) {
                originalContents.set(filePath, content);
              }
              result = content;
              break;
            }

            case "write_file": {
              const filePath = input.path as string;
              const content = input.content as string;

              // Read original if not cached yet
              if (!originalContents.has(filePath)) {
                try {
                  const orig = await readSourceFile(
                    this.projectRoot,
                    filePath
                  );
                  originalContents.set(filePath, orig);
                } catch {
                  originalContents.set(filePath, ""); // new file
                }
              }

              this.emit("fix_patching", `Writing fix to ${filePath}`);
              await writeSourceFile(this.projectRoot, filePath, content);

              const original = originalContents.get(filePath) ?? "";
              const diff = createSimpleDiff(original, content);
              patchedFiles.push({ path: filePath, diff });

              result = `File written: ${filePath}`;
              break;
            }

            case "list_dir": {
              const dirPath = (input.path as string) ?? ".";
              const entries = await listDirectory(this.projectRoot, dirPath);
              result = entries.join("\n");
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

            default:
              result = `Unknown tool: ${tu.name}`;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result = `Error: ${message}`;
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

      // Navigate to the bug's URL (prefer the original bug URL, fall back
      // to targetUrl if the bug URL is relative or unresolvable).
      const navUrl = bug.url.startsWith("http") ? bug.url : targetUrl;
      const response = await page.goto(navUrl, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      const status = response?.status() ?? 0;
      const pageTitle = await page.title();

      // Attempt basic repro: if the bug had steps involving navigation,
      // we already loaded the page. Check for obvious failures.
      const hasPageError = status >= 500;
      const hasConsoleErrors = consoleErrors.length > 0;
      const hasNetworkErrors = networkErrors.length > 0;

      await context.close();

      if (hasPageError) {
        return {
          ok: false,
          message: `Page returned HTTP ${status} at ${navUrl}`,
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
        message: `Page loaded successfully (HTTP ${status}, title: "${pageTitle}")`,
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

  return `You are a senior software engineer tasked with fixing a bug in a web application.

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
${evidenceBlock}

AVAILABLE TOOLS:
  - read_file: Read a source file from the project (pass a relative path).
  - write_file: Write content to a source file (pass relative path + full content).
  - list_dir: List directory contents (pass relative path; use "." for root).
  - search_files: Find files by name pattern (case-insensitive substring match).

INSTRUCTIONS:
  1. Start by exploring the project structure using list_dir and search_files.
  2. Read the source files that are likely related to the bug.
  3. Identify the root cause of the bug.
  4. Apply a MINIMAL, focused fix — change only what is necessary.
  5. Write the corrected file(s) using write_file with the COMPLETE file content.
  6. When done, respond with a text message starting with "DONE:" summarizing the changes.

RULES:
  - Do NOT introduce new dependencies.
  - Do NOT refactor unrelated code.
  - Keep changes minimal — fix the bug and nothing else.
  - If you read a file before writing it, your write_file content must include
    the ENTIRE file, not just the changed section.
  - If you cannot determine a fix with confidence, say so rather than guessing.`;
}

/**
 * Produce a simple unified-style diff between two strings.
 * Not a full unified diff algorithm — just marks changed, added, and
 * removed lines with +/- prefixes for human readability.
 */
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
      if (oldLine !== undefined) {
        lines.push(`-${oldLine}`);
      }
      if (newLine !== undefined) {
        lines.push(`+${newLine}`);
      }
    }
  }

  // Collapse context: only show lines near changes (3-line context window)
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
    } else if (diffLines.length > 0 && diffLines[diffLines.length - 1] !== "...") {
      diffLines.push("...");
    }
  }

  return diffLines.join("\n");
}
