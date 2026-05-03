import Anthropic from "@anthropic-ai/sdk";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeResults } from "./analysis/analyzeResults.js";
import { AgentBrowser } from "./browser.js";
import { createProvider, type LLMProvider, type ToolDef } from "./llm.js";
import { AgentState } from "./state.js";
import type {
  AgentEvent,
  AgentEventType,
  AgentRunOptions,
  AgentRunResult,
  AnalysisResult,
  BrowserAction,
  BrowserToolInput,
  BugReport,
  Severity,
  TestCase,
  TestStep,
} from "./types.js";

const MAX_RETRIES_PER_TEST = 2; // 2 retries → 3 total attempts
const SYSTEM_PROMPT = `You are a senior QA engineer running an autonomous deep agent against a live web application.

Your job is to iteratively explore the application, build an internal model of it, generate and execute test cases, and report bugs. You operate by calling tools — you do not produce free-form prose.

CORE LOOP — repeat each turn:
1. Read the current AppModel snapshot in the previous tool_result.
2. Decide the single highest-value next action that ADVANCES coverage.
3. Call exactly one tool.
4. Read the result. Adapt.

PRIORITIES (roughly in order):
  a. Reach the homepage and extract its structure.
  b. Discover routes from links — visit and extract each unfamiliar one (cap ~6 routes).
  c. When you find a form or auth flow, record it via record_observation.
  d. After ~4–6 routes are mapped, start adding test cases (smoke, navigation, form_validation, error_handling at minimum).
  e. Run each queued test via run_test. If it fails, analyze the error in the tool_result, then EITHER add a refined test (different selector, added wait, alternate order) and run that, OR call run_test again on the same id with a different strategy. Max 3 total attempts per test id.
  f. When a test confirms a real defect (not flake), call report_bug.
  g. When coverage is sufficient, call finish.

TOOL USE RULES:
  - Use browser_action with action ∈ {navigate, click, type, extract, screenshot}.
  - For navigate, target is a full URL.
  - For click / type / screenshot, target is a CSS selector. For type, value is the text.
  - For extract, target = "page" extracts the whole page (links, forms, buttons, headings, console errors). Or pass a selector for a region.
  - NEVER invent selectors. Use selectors returned by previous extract results.
  - record_observation domains: routes | auth | entities | flows | forms.
  - add_test produces a queued TestCase. run_test executes it via Playwright.
  - report_bug requires concrete evidence (a failed test or an extract showing the defect).
  - finish ends the run with a summary.

CONSTRAINTS:
  - Do NOT repeat an extract on the same URL you already extracted.
  - Do NOT call browser_action(navigate) on a URL you already mapped unless re-verifying after a fix.
  - Keep targets deterministic — no randomness.
  - Stop when coverage is sufficient or you have used your step budget. The runner will also enforce a hard max.
  - If a tool returns an error, do not repeat the exact same call — adapt.
"If you encounter a page that requires a login, or if you see a password field, DO NOT try to guess credentials. Immediately call handle_authentication with a description of the fields you see."
Begin.`;

type ToolBlock = Anthropic.Messages.ToolUseBlock;

interface ToolDispatch {
  payload: unknown;
  finished?: boolean;
  finishReason?: string;
  events?: AgentEvent[];
}

const TOOL_DEFINITIONS: ToolDef[] = [
  {
    name: "browser_action",
    description:
      "Perform a single browser action against the live page. Use action=extract first to learn the page structure before clicking or typing.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["navigate", "click", "type", "extract", "screenshot"],
          description: "The action to perform.",
        },
        target: {
          type: "string",
          description:
            "navigate: absolute URL. click/type/screenshot: CSS selector. extract: 'page' or CSS selector for a region.",
        },
        value: {
          type: "string",
          description: "Text to type. Required only when action=type.",
        },
        reason: {
          type: "string",
          description: "One-sentence rationale for this action.",
        },
      },
      required: ["action", "target", "reason"],
    },
  },
  {
    name: "record_observation",
    description:
      "Update the persistent AppModel with a discovery (route, auth state, entity, flow, or form).",
    input_schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: ["routes", "auth", "entities", "flows", "forms"],
        },
        data: {
          type: "object",
          description:
            "Domain-specific record. routes: {url,title?,status?,notes?}. auth: {hasLogin?,hasSignup?,hasLogout?,loginUrl?,signupUrl?,loggedIn?,notes?}. entities: {name,fields[],routes[],notes?}. flows: {name,steps[],startUrl,status?}. forms: {url,selector,method,fields[{name,type,required,selector}],submitSelector,purpose}.",
        },
        reason: { type: "string" },
      },
      required: ["domain", "data", "reason"],
    },
  },
  {
    name: "handle_authentication",
    description: "Call this when you encounter a login wall, password field, or MFA prompt. It will pause execution and request secure credentials from the user.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why is auth needed? (e.g., 'Encountered login form', 'MFA required')" },
        fields: { type: "array", items: { type: "string" }, description: "List of fields detected (e.g., ['username', 'password', 'otp'])" },
      },
      required: ["reason"],
    },
  },
  {
    name: "add_test",
    description: "Append a new structured test case to the queue.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: {
          type: "string",
          enum: [
            "smoke",
            "navigation",
            "authentication",
            "form_validation",
            "crud",
            "error_handling",
            "regression",
          ],
        },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        expected: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["navigate", "click", "type", "extract", "screenshot"],
              },
              target: { type: "string" },
              value: { type: "string" },
              expected: { type: "string" },
            },
            required: ["action", "target"],
          },
        },
        reason: { type: "string" },
      },
      required: ["title", "type", "priority", "expected", "steps", "reason"],
    },
  },
  {
    name: "run_test",
    description:
      "Execute a queued test by id. Returns per-step results. If failed, analyze the error and either retry (max 3 attempts) or move on.",
    input_schema: {
      type: "object",
      properties: {
        test_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["test_id", "reason"],
    },
  },
  {
    name: "report_bug",
    description: "File a bug report with severity, repro steps, and impact.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
        impact: { type: "string" },
        reproSteps: { type: "array", items: { type: "string" } },
        expected: { type: "string" },
        actual: { type: "string" },
        url: { type: "string" },
        testId: { type: "string", description: "Linked test id, if any." },
        reason: { type: "string" },
      },
      required: ["title", "severity", "impact", "reproSteps", "expected", "actual", "url", "reason"],
    },
  },
  {
    name: "finish",
    description: "Stop the run. Use when coverage is sufficient or no further useful actions exist.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        summary: { type: "string", description: "1–3 sentence summary of findings." },
      },
      required: ["reason", "summary"],
    },
  },
];

export class DeepAgent {
  private readonly provider: LLMProvider;
  private readonly maxSteps: number;
  private readonly state: AgentState;
  private readonly browser: AgentBrowser;
  private readonly events: AgentEvent[] = [];
  private onEvent?: (e: AgentEvent) => void;
  private step = 0;
  private extractedUrls = new Set<string>();
  private reportDir: string;
  private analysis?: AnalysisResult;

  constructor(private readonly opts: AgentRunOptions) {
    if (!opts.provider) {
      throw new Error("AgentRunOptions.provider is required (use resolveProviderConfig).");
    }
    this.provider = createProvider(opts.provider);
    this.maxSteps = opts.maxSteps ?? 50;
    this.reportDir = opts.reportDir ?? "./reports";
    this.state = new AgentState(opts.url);
    this.browser = new AgentBrowser({
      headless: opts.headless ?? true,
      reportDir: this.reportDir,
    });
    this.onEvent = opts.onEvent;
  }

  private emit(type: AgentEventType, payload: unknown): void {
    const e: AgentEvent = {
      type,
      timestamp: new Date().toISOString(),
      step: this.step,
      payload,
    };
    this.events.push(e);
    this.onEvent?.(e);
  }

  async run(): Promise<AgentRunResult> {
    await mkdir(this.reportDir, { recursive: true });
    await this.browser.start();
    this.emit("run_start", {
      url: this.opts.url,
      maxSteps: this.maxSteps,
      provider: this.provider.name,
      model: this.provider.modelId,
    });

    const health = await this.provider.health();
    if (!health.ok) {
      this.emit("run_error", { error: health.detail });
      await this.browser.stop();
      const reportPaths = await this.writeReports();
      this.emit("run_end", {
        ok: false,
        stoppedReason: `provider_unhealthy: ${health.detail}`,
        steps: 0,
        tests: 0,
        bugs: 0,
        reportJsonPath: reportPaths.json,
        reportMdPath: reportPaths.md,
      });
      return {
        ok: false,
        steps: 0,
        stoppedReason: `provider_unhealthy: ${health.detail}`,
        model: this.state.model,
        tests: this.state.tests,
        bugs: this.state.bugs,
        events: this.events,
        reportJsonPath: reportPaths.json,
        reportMdPath: reportPaths.md,
      };
    }

    let stoppedReason = "max_steps_reached";
    let ok = true;

    try {
      const initialUserText = [
        `Target application: ${this.opts.url}`,
        `Step budget: ${this.maxSteps}`,
        `Begin by navigating to ${this.opts.url}, then extract the page.`,
        "",
        "Initial AppModel snapshot:",
        this.state.snapshot(),
      ].join("\n");

      const messages: Anthropic.Messages.MessageParam[] = [
        { role: "user", content: initialUserText },
      ];

      while (this.step < this.maxSteps) {
        this.step += 1;
        this.emit("step_start", { step: this.step, of: this.maxSteps });

        const response = await this.provider.chat({
          system: SYSTEM_PROMPT,
          tools: TOOL_DEFINITIONS,
          messages,
          maxTokens: 4096,
        });

        if (response.content.length > 0) {
          messages.push({ role: "assistant", content: response.content });
        }

        if (response.stopReason === "end_turn" || response.stopReason === "max_tokens") {
          // Model didn't call a tool. Nudge it to continue with state.
          if (this.step >= this.maxSteps) {
            stoppedReason = "max_steps_reached";
            break;
          }
          messages.push({
            role: "user",
            content: `You did not call a tool. Continue the loop. Current state:\n${this.state.snapshot()}`,
          });
          continue;
        }

        const toolUses: ToolBlock[] = response.content.filter(
          (b): b is ToolBlock => b.type === "tool_use"
        ) as ToolBlock[];

        if (toolUses.length === 0) {
          stoppedReason = "no_tool_use";
          break;
        }

        const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];
        let finished = false;
        let finishReason = "";

        for (const tu of toolUses) {
          this.emit("tool_call", {
            id: tu.id,
            name: tu.name,
            input: tu.input,
          });

          const dispatch = await this.dispatch(tu);
          this.emit("tool_result", {
            id: tu.id,
            name: tu.name,
            payload: dispatch.payload,
          });

          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(dispatch.payload),
          });

          if (dispatch.finished) {
            finished = true;
            finishReason = dispatch.finishReason ?? "agent_finished";
          }
        }

        const cov = this.state.coverageOk();
        const snapshot = this.state.snapshot();
        const stateText = `Updated AppModel snapshot (step ${this.step}/${this.maxSteps}):\n${snapshot}\n\nCoverage: ${cov.reason}.`;

        messages.push({
          role: "user",
          content: [
            ...toolResultBlocks,
            { type: "text", text: stateText },
          ],
        });

        if (finished) {
          stoppedReason = finishReason;
          break;
        }

        if (cov.sufficient && this.tests().length >= 6) {
          // Soft hint — agent should call finish on its own. We don't force-stop here.
        }
      }
    } catch (err) {
      ok = false;
      const message = err instanceof Error ? err.message : String(err);
      stoppedReason = `error: ${message}`;
      this.emit("run_error", { error: message });
    } finally {
      await this.browser.stop();
    }

    // Post-test analysis: deterministically classify every failed test into
    // real bugs vs. test issues. Runs even when the loop errored — partial
    // results still benefit from accurate categorization.
    this.runPostTestAnalysis();

    const reportPaths = await this.writeReports();
    this.emit("run_end", {
      ok,
      stoppedReason,
      steps: this.step,
      tests: this.tests().length,
      bugs: this.bugs().length,
      testIssues: this.analysis?.testIssues.length ?? 0,
      correctedTests: this.analysis?.correctedTests.length ?? 0,
      reportJsonPath: reportPaths.json,
      reportMdPath: reportPaths.md,
    });

    return {
      ok,
      steps: this.step,
      stoppedReason,
      model: this.state.model,
      tests: this.state.tests,
      bugs: this.state.bugs,
      analysis: this.analysis,
      events: this.events,
      reportJsonPath: reportPaths.json,
      reportMdPath: reportPaths.md,
    };
  }

  private runPostTestAnalysis(): void {
    const alreadyReported = new Set(
      this.state.bugs.map((b) => b.testId).filter((x): x is string => Boolean(x))
    );
    const result = analyzeResults(this.state.tests, {
      appUrl: this.opts.url,
      alreadyReportedTestIds: alreadyReported,
    });

    // Merge analyzer-discovered bugs into state — convert through state so
    // they get sequential BUG_xxx ids consistent with agent-reported bugs.
    for (const bug of result.bugs) {
      const stored = this.state.reportBug({
        title: bug.title,
        severity: bug.severity,
        impact: bug.impact,
        reproSteps: bug.reproSteps,
        expected: bug.expected,
        actual: bug.actual,
        url: bug.url,
        testId: bug.testId,
      });
      // Decorate with provenance + evidence the agent doesn't carry.
      stored.source = "analysis";
      stored.evidence = bug.evidence;
      this.emit("bug_reported", { bug: stored, source: "analysis" });
    }

    for (const issue of result.testIssues) {
      this.emit("test_issue_identified", { issue });
    }
    for (const corrected of result.correctedTests) {
      this.emit("corrected_test_generated", { corrected });
    }

    this.analysis = result;
    this.emit("analysis_complete", { summary: result.summary });
  }

  private async dispatch(tu: ToolBlock): Promise<ToolDispatch> {
    const input = (tu.input ?? {}) as Record<string, unknown>;
    switch (tu.name) {
      case "browser_action":
        return this.handleBrowserAction(input);
      case "record_observation":
        return this.handleRecordObservation(input);
      case "add_test":
        return this.handleAddTest(input);
      case "run_test":
        return this.handleRunTest(input);
      case "report_bug":
        return this.handleReportBug(input);
      case "handle_authentication":
        return await this.requestHumanAuth(input.reason as string, input.fields as Record<string, unknown>);
      case "finish":
        return {
          payload: {
            ok: true,
            summary: input.summary ?? "",
            reason: input.reason ?? "",
          },
          finished: true,
          finishReason: typeof input.reason === "string" ? input.reason : "agent_finished",
        };
      default:
        return { payload: { ok: false, error: `unknown tool ${tu.name}` } };
    }
  }

  private async handleBrowserAction(input: Record<string, unknown>): Promise<ToolDispatch> {
    const action = input.action as BrowserAction;
    const target = (input.target as string) ?? "";
    const value = typeof input.value === "string" ? (input.value as string) : undefined;
    const reason = (input.reason as string) ?? "";

    if (action === "extract" && (target === "page" || target === "")) {
      const url = this.browser.currentUrl();
      if (this.extractedUrls.has(url)) {
        return {
          payload: {
            ok: false,
            note: `Already extracted ${url} this run. Pick a new URL or call a different action.`,
            url,
          },
        };
      }
    }

    const browserInput: BrowserToolInput = { action, target, value, reason };
    const result = await this.browser.execute(browserInput);

    if (action === "extract" && result.ok && (target === "page" || target === "")) {
      this.extractedUrls.add(result.url);
      // Auto-record the visited route on a successful extract.
      this.state.recordRoute({
        url: result.url,
        title: result.title,
        status:
          (result.data as { status?: number } | undefined)?.status ?? 200,
        notes: "auto: extracted",
      });
    }

    if (action === "navigate" && result.ok) {
      this.state.recordRoute({
        url: result.url,
        title: result.title,
        status:
          (result.data as { status?: number } | undefined)?.status ?? 200,
        notes: "auto: navigated",
      });
    }

    // Truncate large extract payloads before returning.
    if (action === "extract" && result.data && typeof result.data === "object") {
      result.data = this.truncateExtract(result.data as Record<string, unknown>);
    }

    return { payload: result };
  }

  private truncateExtract(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...data };
    if (Array.isArray(out.links)) out.links = (out.links as unknown[]).slice(0, 30);
    if (Array.isArray(out.buttons)) out.buttons = (out.buttons as unknown[]).slice(0, 20);
    if (Array.isArray(out.inputs)) out.inputs = (out.inputs as unknown[]).slice(0, 20);
    if (Array.isArray(out.forms)) out.forms = (out.forms as unknown[]).slice(0, 8);
    if (typeof out.textPreview === "string") {
      out.textPreview = (out.textPreview as string).slice(0, 800);
    }
    return out;
  }

  private async handleRecordObservation(
    input: Record<string, unknown>
  ): Promise<ToolDispatch> {
    const domain = input.domain as string;
    const data = (input.data ?? {}) as Record<string, unknown>;
    try {
      switch (domain) {
        case "routes": {
          if (typeof data.url !== "string") throw new Error("url required");
          const r = this.state.recordRoute({
            url: data.url,
            title: typeof data.title === "string" ? data.title : "",
            status: typeof data.status === "number" ? data.status : 0,
            notes: typeof data.notes === "string" ? data.notes : "",
          });
          this.emit("model_update", { domain, entry: r });
          return { payload: { ok: true, recorded: r } };
        }
        case "auth": {
          const a = this.state.updateAuth({
            hasLogin: typeof data.hasLogin === "boolean" ? data.hasLogin : undefined,
            hasSignup: typeof data.hasSignup === "boolean" ? data.hasSignup : undefined,
            hasLogout: typeof data.hasLogout === "boolean" ? data.hasLogout : undefined,
            loginUrl: typeof data.loginUrl === "string" ? data.loginUrl : undefined,
            signupUrl: typeof data.signupUrl === "string" ? data.signupUrl : undefined,
            loggedIn: typeof data.loggedIn === "boolean" ? data.loggedIn : undefined,
            notes: typeof data.notes === "string" ? data.notes : undefined,
          });
          this.emit("model_update", { domain, entry: a });
          return { payload: { ok: true, auth: a } };
        }
        case "entities": {
          if (typeof data.name !== "string") throw new Error("name required");
          const e = this.state.recordEntity({
            name: data.name,
            fields: Array.isArray(data.fields) ? (data.fields as string[]) : [],
            routes: Array.isArray(data.routes) ? (data.routes as string[]) : [],
            notes: typeof data.notes === "string" ? data.notes : "",
          });
          this.emit("model_update", { domain, entry: e });
          return { payload: { ok: true, recorded: e } };
        }
        case "flows": {
          if (typeof data.name !== "string") throw new Error("name required");
          const f = this.state.recordFlow({
            name: data.name,
            steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
            startUrl: typeof data.startUrl === "string" ? data.startUrl : "",
            status: ((): "discovered" | "verified" | "broken" => {
              const s = data.status;
              if (s === "verified" || s === "broken") return s;
              return "discovered";
            })(),
          });
          this.emit("model_update", { domain, entry: f });
          return { payload: { ok: true, recorded: f } };
        }
        case "forms": {
          if (typeof data.url !== "string" || typeof data.selector !== "string") {
            throw new Error("url and selector required");
          }
          const f = this.state.recordForm({
            url: data.url,
            selector: data.selector,
            method: typeof data.method === "string" ? data.method : "post",
            submitSelector:
              typeof data.submitSelector === "string" ? data.submitSelector : "",
            fields: Array.isArray(data.fields)
              ? (data.fields as Array<Record<string, unknown>>).map((fld) => ({
                  name: typeof fld.name === "string" ? fld.name : "",
                  type: typeof fld.type === "string" ? fld.type : "text",
                  required: typeof fld.required === "boolean" ? fld.required : false,
                  selector: typeof fld.selector === "string" ? fld.selector : "",
                }))
              : [],
            purpose: typeof data.purpose === "string" ? data.purpose : "",
          });
          this.emit("model_update", { domain, entry: f });
          return { payload: { ok: true, recorded: f } };
        }
        default:
          return { payload: { ok: false, error: `unknown domain ${domain}` } };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { payload: { ok: false, error: message } };
    }
  }

  private async handleAddTest(input: Record<string, unknown>): Promise<ToolDispatch> {
    try {
      const steps: TestStep[] = Array.isArray(input.steps)
        ? (input.steps as Array<Record<string, unknown>>).map((s) => ({
            action: s.action as TestStep["action"],
            target: typeof s.target === "string" ? s.target : "",
            value: typeof s.value === "string" ? s.value : undefined,
            expected: typeof s.expected === "string" ? s.expected : undefined,
          }))
        : [];
      if (steps.length === 0) throw new Error("steps required");

      const test = this.state.addTest({
        title: typeof input.title === "string" ? input.title : "Untitled test",
        steps,
        expected: typeof input.expected === "string" ? input.expected : "",
        type: (input.type as TestCase["type"]) ?? "smoke",
        priority: (input.priority as TestCase["priority"]) ?? "medium",
      });
      this.emit("test_added", { test });
      return { payload: { ok: true, test } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { payload: { ok: false, error: message } };
    }
  }

  private async handleRunTest(input: Record<string, unknown>): Promise<ToolDispatch> {
    const id = (input.test_id as string) ?? "";
    const test = this.state.tests.find((t) => t.id === id);
    if (!test) {
      return { payload: { ok: false, error: `test ${id} not found` } };
    }
    if (test.attempts >= 1 + MAX_RETRIES_PER_TEST) {
      return {
        payload: {
          ok: false,
          error: `${id} exhausted retries (attempts=${test.attempts}). Move on or refine into a new test.`,
        },
      };
    }

    this.state.setTestStatus(id, "running", { incrementAttempt: true });
    this.emit("test_started", { test });

    const stepLogs: Array<{
      index: number;
      action: BrowserAction;
      target: string;
      ok: boolean;
      url: string;
      error?: string;
      durationMs: number;
    }> = [];

    let failedAt: number | undefined;
    let failureMsg: string | undefined;
    let lastUrl = "";

    for (let i = 0; i < test.steps.length; i += 1) {
      const step = test.steps[i];
      const result = await this.browser.execute({
        action: step.action,
        target: step.target,
        value: step.value,
        reason: `test ${id} step ${i + 1}`,
      });
      lastUrl = result.url;
      stepLogs.push({
        index: i,
        action: step.action,
        target: step.target,
        ok: result.ok,
        url: result.url,
        error: result.error,
        durationMs: result.durationMs,
      });
      if (!result.ok) {
        failedAt = i;
        failureMsg = result.error;
        break;
      }
    }

    if (failedAt === undefined) {
      this.state.setTestStatus(id, "passed");
      this.emit("test_passed", { test, stepLogs });
      return {
        payload: {
          ok: true,
          test_id: id,
          status: "passed",
          attempts: test.attempts,
          stepLogs,
          finalUrl: lastUrl,
        },
      };
    }

    this.state.setTestStatus(id, "failed", {
      error: failureMsg,
      failedStepIndex: failedAt,
    });

    if (test.attempts < 1 + MAX_RETRIES_PER_TEST) {
      this.emit("test_retry", { test, failedAt, error: failureMsg });
    } else {
      this.emit("test_failed", { test, failedAt, error: failureMsg });
    }

    return {
      payload: {
        ok: false,
        test_id: id,
        status: "failed",
        attempts: test.attempts,
        attemptsRemaining: 1 + MAX_RETRIES_PER_TEST - test.attempts,
        failedStepIndex: failedAt,
        failedStep: test.steps[failedAt],
        error: failureMsg,
        stepLogs,
        finalUrl: lastUrl,
        retryHints: [
          "Inspect failedStep.target — is it a stale or invented selector?",
          "Re-extract the page at finalUrl to discover the right selector.",
          "Add an extract or wait step before the failing action.",
          "If selector is unreliable, add a refined test with a different strategy and run that.",
        ],
      },
    };
  }

  private async handleReportBug(input: Record<string, unknown>): Promise<ToolDispatch> {
    const bug: BugReport = this.state.reportBug({
      title: typeof input.title === "string" ? input.title : "Untitled bug",
      severity: (input.severity as Severity) ?? "medium",
      impact: typeof input.impact === "string" ? input.impact : "",
      reproSteps: Array.isArray(input.reproSteps) ? (input.reproSteps as string[]) : [],
      expected: typeof input.expected === "string" ? input.expected : "",
      actual: typeof input.actual === "string" ? input.actual : "",
      url: typeof input.url === "string" ? input.url : "",
      testId: typeof input.testId === "string" ? input.testId : undefined,
    });
    this.emit("bug_reported", { bug });
    return { payload: { ok: true, bug } };
  }

  private async requestHumanAuth(reason: string, fields: Record<string, unknown>): Promise<ToolDispatch> {
    const fieldList = Array.isArray(fields) ? (fields as string[]) : [];

    this.emit("auth_required", { reason, fields: fieldList });

    try {
      const credentials = await new Promise<Record<string, string>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Authentication request timed out after 5 minutes"));
        }, 5 * 60 * 1000);

        const handler = (e: AgentEvent) => {
          if (e.type === "auth_response") {
            clearTimeout(timeout);
            resolve((e.payload as Record<string, string>) ?? {});
          }
        };
        this.onEvent = handler;
      });

      for (const field of fieldList) {
        if (credentials[field]) {
          await this.browser.execute({
            action: "type",
            target: `input[name="${field}"], input[id="${field}"]`,
            value: credentials[field],
            reason: `Filling ${field} field for authentication`,
          });
        }
      }

      await this.browser.execute({
        action: "click",
        target: 'button[type="submit"], input[type="submit"]',
        reason: "Submitting authentication form",
      });

      this.emit("auth_submitted", { reason });
      return { payload: { ok: true, message: "Authentication submitted. Continuing exploration..." } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { payload: { ok: false, error: message } };
    }
  }

  private tests(): TestCase[] {
    return this.state.tests;
  }
  private bugs(): BugReport[] {
    return this.state.bugs;
  }

  private async writeReports(): Promise<{ json: string; md: string }> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const jsonPath = path.join(this.reportDir, `agent-report-${stamp}.json`);
    const mdPath = path.join(this.reportDir, `agent-report-${stamp}.md`);
    const a = this.analysis;
    const summary = {
      url: this.opts.url,
      provider: this.provider.name,
      model: this.provider.modelId,
      steps: this.step,
      maxSteps: this.maxSteps,
      tests: this.state.tests.length,
      passed: this.state.tests.filter((t) => t.status === "passed").length,
      failed: this.state.tests.filter((t) => t.status === "failed").length,
      bugs: this.state.bugs.length,
      testIssues: a?.testIssues.length ?? 0,
      correctedTests: a?.correctedTests.length ?? 0,
      realBugs: a?.summary.realBugs ?? this.state.bugs.length,
      falseFailures: a?.summary.falseFailures ?? 0,
      timestamp: new Date().toISOString(),
    };
    const fullReport = {
      summary,
      appModel: this.state.model,
      tests: this.state.tests,
      bugs: this.state.bugs,
      analysis: a
        ? {
            summary: a.summary,
            testIssues: a.testIssues,
            correctedTests: a.correctedTests,
          }
        : null,
      events: this.events.length,
    };
    await writeFile(jsonPath, JSON.stringify(fullReport, null, 2));
    await writeFile(mdPath, this.renderMarkdown(summary));
    return { json: jsonPath, md: mdPath };
  }

  private renderMarkdown(summary: Record<string, unknown>): string {
    const lines: string[] = [];
    const a = this.analysis;
    lines.push(`# AI QA Deep Agent Report`);
    lines.push("");
    lines.push(`- **Target:** ${summary.url}`);
    lines.push(`- **Provider:** ${summary.provider} (${summary.model})`);
    lines.push(`- **Steps:** ${summary.steps} / ${summary.maxSteps}`);
    lines.push(
      `- **Tests:** ${summary.tests} (passed=${summary.passed}, failed=${summary.failed})`
    );
    lines.push(
      `- **Real bugs:** ${summary.realBugs} · **Test issues (false failures):** ${summary.falseFailures} · **Corrected tests suggested:** ${summary.correctedTests}`
    );
    lines.push(`- **Generated:** ${summary.timestamp}`);
    lines.push("");
    lines.push("## Application Model");
    lines.push("```json");
    lines.push(JSON.stringify(this.state.model, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("## Test Cases");
    for (const t of this.state.tests) {
      lines.push(`### ${t.id} — ${t.title} (${t.status})`);
      lines.push(`- type: ${t.type}, priority: ${t.priority}, attempts: ${t.attempts}`);
      lines.push(`- expected: ${t.expected}`);
      if (t.lastError) lines.push(`- last error: ${t.lastError}`);
      lines.push("- steps:");
      t.steps.forEach((s, i) => {
        lines.push(
          `  ${i + 1}. \`${s.action}\` ${s.target}${s.value ? ` value="${s.value}"` : ""}`
        );
      });
      lines.push("");
    }
    if (this.state.bugs.length > 0) {
      lines.push("## Bug Reports");
      for (const b of this.state.bugs) {
        const provenance = b.source ? ` _(${b.source})_` : "";
        lines.push(`### ${b.id} — [${b.severity.toUpperCase()}] ${b.title}${provenance}`);
        lines.push(`- url: ${b.url}`);
        lines.push(`- impact: ${b.impact}`);
        lines.push(`- expected: ${b.expected}`);
        lines.push(`- actual: ${b.actual}`);
        if (b.testId) lines.push(`- test: ${b.testId}`);
        lines.push(`- steps_to_reproduce:`);
        b.reproSteps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
        if (b.evidence) {
          lines.push(`- evidence.error: ${b.evidence.error.slice(0, 240)}`);
        }
        lines.push("");
      }
    }
    if (a && a.testIssues.length > 0) {
      lines.push("## Test Issues (failures that are NOT bugs)");
      for (const issue of a.testIssues) {
        lines.push(`### ${issue.testId} — ${issue.testTitle}`);
        lines.push(`- category: \`${issue.category}\``);
        lines.push(`- reason: ${issue.reason}`);
        lines.push(
          `- failed step ${issue.failedStepIndex + 1}: \`${issue.failedStep.action}\` ${issue.failedStep.target}`
        );
        lines.push(`- error: ${issue.error.slice(0, 240)}`);
        lines.push("");
      }
    }
    if (a && a.correctedTests.length > 0) {
      lines.push("## Corrected Tests (suggestions for the next run)");
      for (const c of a.correctedTests) {
        lines.push(`### ${c.corrected.id} — ${c.corrected.title}`);
        lines.push(`- replaces: ${c.originalId} (${c.originalTitle})`);
        lines.push(`- rationale: ${c.rationale}`);
        lines.push(`- steps:`);
        c.corrected.steps.forEach((s, i) => {
          lines.push(
            `  ${i + 1}. \`${s.action}\` ${s.target}${s.value ? ` value="${s.value}"` : ""}`
          );
        });
        lines.push("");
      }
    }
    return lines.join("\n");
  }
}

export async function runDeepAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const agent = new DeepAgent(opts);
  return agent.run();
}
