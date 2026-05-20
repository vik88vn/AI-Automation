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
  FailureContext,
  FormEntry,
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
  - Use browser_action with action ∈ {navigate, click, click_immediate, type, extract, screenshot}.
  - For navigate, target is a full URL.
  - For click / click_immediate / type / screenshot, target is a CSS selector. For type, value is the text.
  - click_immediate skips visibility/enabled checks — use it for race-condition probes (see BUG DETECTION rule 6).
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

BUG DETECTION RULES — apply these on every tool_result:

  1. NETWORK ERRORS (highest priority): Every browser_action result may now
     include a \`networkErrors\` array listing 5xx responses that fired during
     that action. ANY 5xx URL in networkErrors is a server bug — call
     report_bug immediately citing:
       - severity: "high" for /api/auth, /api/admin, /api/checkout endpoints; "medium" otherwise
       - url: the page where the action was triggered
       - reproSteps: the exact form fields and values you submitted
       - actual: include the 5xx URL verbatim
     Do NOT mark the test passed when networkErrors is non-empty. The frontend
     may show a friendly "Network error" message that hides a real server crash.

  2. AUTH BYPASS: After submitting a login form with clearly invalid credentials
     (wrong password, malformed email, empty password), check the finalUrl in
     the result. If it contains "dashboard", "account", "profile", "admin", or
     any path that should require authentication, file a HIGH severity auth
     bypass bug. The expected behavior is staying on /login with an error.

  3. FUZZ INPUTS: For every text/search input you discover, generate at least
     one error_handling test using each of these adversarial inputs:
       - Regex specials: \`[\`, \`(\`, \`*?\`, \`\\\`  (crash naive regex backends)
       - SQL injection: \`' OR 1=1 --\`
       - Path traversal: \`../../../etc/passwd\`
       - Length overflow: a 300+ character string
       - Empty string for required fields
     These inputs are the most likely to expose unvalidated server code.

  4. PERFORMANCE: navigate results include \`metrics.componentBreakdown.actionMs\`.
     If actionMs > 2000 on any page, note it. If the same URL exceeds 2000ms
     across two separate visits, file a LOW severity performance bug citing the
     observed latency.

  5. CROSS-LAYER VALIDATION: When a server error fires on a form submission
     (rule 1 catches it), also inspect the form's recorded fields for the
     offending input. If the field has \`required: false\` and the frontend
     allowed empty/invalid input through, file a SECOND low severity bug for
     the missing frontend guard. This is the same root cause with two
     manifestations.

  6. RACE CONDITIONS: Use action=click_immediate on freshly-loaded pages when
     you suspect a button has a transient enabled state (e.g., disabled
     out-of-stock items, modals that auto-dismiss). Standard click waits for
     stable visibility, which can hide race-window bugs.

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
          enum: ["navigate", "click", "click_immediate", "type", "extract", "screenshot"],
          description:
            "The action to perform. `click_immediate` is a race-condition probe — it clicks as soon as the element is attached (no wait for visible/enabled, force=true). Use it when investigating buttons that may be transiently enabled/disabled by JS.",
        },
        target: {
          type: "string",
          description:
            "navigate: absolute URL. click/click_immediate/type/screenshot: CSS selector. extract: 'page' or CSS selector for a region.",
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
                enum: [
                  "navigate",
                  "click",
                  "click_immediate",
                  "type",
                  "extract",
                  "screenshot",
                ],
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
  private slowNavigations = new Map<string, number[]>();
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
            case "finish": {
        const highQueued = this.tests().filter(
          (t) => t.status === "queued" && t.priority === "high"
        );
        if (highQueued.length > 0) {
          return {
            payload: {
              ok: false,
              error: `Cannot finish: ${highQueued.length} high-priority test(s) still queued. Run them first: ${highQueued.map((t) => t.id).join(", ")}`,
            },
          };
        }
        return {
          payload: {
            ok: true,
            summary: input.summary ?? "",
            reason: input.reason ?? "",
          },
          finished: true,
          finishReason: typeof input.reason === "string" ? input.reason : "agent_finished",
        };
      }
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
      // Race-condition seeding: queue a click_immediate probe for any
      // non-form button found on the page (cart buttons, action buttons).
      this.seedClickImmediateProbes(result.url, result.data);
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
           this.seedFormVariants(f);
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

    // Reset the browser's transient error buffers so 5xx responses captured
    // during a previous test cannot leak into this test's networkErrors and
    // be misattributed by the auto-bug-reporting helpers.
    this.browser.clearTransientErrors();

    const stepLogs: Array<{
      index: number;
      action: BrowserAction;
      target: string;
      ok: boolean;
      url: string;
      error?: string;
      durationMs: number;
      failureContext?: FailureContext;
      networkErrors?: string[];
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
      const stepNetworkErrors = this.extractNetworkErrors(result);
      stepLogs.push({
        index: i,
        action: step.action,
        target: step.target,
        ok: result.ok,
        url: result.url,
        error: result.error,
        durationMs: result.durationMs,
        failureContext: result.failureContext,
        networkErrors: stepNetworkErrors.length > 0 ? stepNetworkErrors : undefined,
      });

      // Race condition probe: if click_immediate succeeded and the element
      // is now disabled, JS disabled it after the click fired — race window confirmed.
      if (
        step.action === "click_immediate" &&
        result.ok &&
        (result.data as Record<string, unknown>)?.wasDisabledAfterClick === true
      ) {
        this.autoreportRaceCondition(test, id, step.target, result.url);
      }

      if (!result.ok) {
        failedAt = i;
        failureMsg = result.error;
        // When building a failed test case, include failure context
        const failedStep = stepLogs[failedAt];
        if (failedStep && failedStep.failureContext) {
          test.failureContext = failedStep.failureContext;
        }
        break;
      }
    }

    // Deterministic network-error detection: inspect every step's data payload
    // for 5xx responses that the browser captured. This runs even when all
    // Playwright actions succeeded (ok=true), because a form submit can return
    // HTTP 200 to the page while the XHR it triggered returns 500.
    if (failedAt === undefined) {
      const allNetworkErrors = stepLogs.flatMap((s) => s.networkErrors ?? []);
      if (allNetworkErrors.length > 0) {
        const firstErrorStepIdx = stepLogs.findIndex(
          (s) => (s.networkErrors ?? []).length > 0
        );
        failedAt = firstErrorStepIdx;
        failureMsg = `Server error(s) during test: ${allNetworkErrors.join("; ")}`;
        this.autoreportNetworkBug(test, id, stepLogs, allNetworkErrors);
        this.autoreportFrontendValidationGap(test, id, lastUrl);
      }
    }

    // Auth bypass: if an auth test lands on a protected URL, the server
    // accepted credentials it should have rejected.
    if (failedAt === undefined && test.type === "authentication") {
      const PROTECTED_PATHS = ["/dashboard", "/account", "/profile", "/admin"];
      const landedOnProtectedUrl = PROTECTED_PATHS.some((p) => lastUrl.includes(p));
      if (landedOnProtectedUrl) {
        failedAt = test.steps.length - 1;
        failureMsg = `Auth bypass: submitted invalid credentials but landed on ${lastUrl}`;
        this.autoreportAuthBypass(test, id, lastUrl);
      }
    }

    // Performance: flag any navigate step that took over 2000ms.
    if (failedAt === undefined) {
      for (const log of stepLogs) {
        if (log.action === "navigate" && log.durationMs > 2000) {
          this.recordSlowNavigation(log.url, log.durationMs);
        }
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

    // When creating a bug from a failed test, attach the failure context as
    // structured evidence — error type, stack trace, console logs, and a
    // selector analysis that the dashboard can render directly.
    const testId = typeof input.testId === "string" ? input.testId : undefined;
    const linkedTest = testId ? this.state.tests.find(t => t.id === testId) : undefined;
    if (linkedTest && linkedTest.failureContext) {
      const fc = linkedTest.failureContext;
      // Resolve the actual selector that failed (from the test's failed step).
      const failedStep =
        linkedTest.failedStepIndex !== undefined
          ? linkedTest.steps[linkedTest.failedStepIndex]
          : undefined;
      const selector = failedStep?.target ?? "(unknown)";
      bug.evidence = {
        error: fc.errorMessage,
        logs: fc.pageState?.consoleErrors,
        stackTrace: fc.stackTrace,
        errorType: fc.errorType,
        selectorAnalysis: {
          selector,
          found: fc.selectorValid,
          // If selector wasn't found at all, it can't be visible.
          visible: fc.selectorValid,
        },
      };
    }

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

  // Pull the networkErrors array out of a BrowserToolResult's data payload.
  // The browser layer always stores them there; this is the one place we
  // unwrap them so the calling code stays type-safe.
  private extractNetworkErrors(
    result: Awaited<ReturnType<typeof this.browser.execute>>
  ): string[] {
    if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
      return [];
    }
    const data = result.data as Record<string, unknown>;
    return Array.isArray(data.networkErrors) ? (data.networkErrors as string[]) : [];
  }

  // Immediately file a BugReport for a network error that surfaced during a
  // test run. Runs before the test status is written so the bug appears in
  // the report even if the agent never calls report_bug on its own.
  private autoreportNetworkBug(
    test: TestCase,
    testId: string,
    stepLogs: Array<{ index: number; action: BrowserAction; target: string; value?: string; url: string; networkErrors?: string[] }>,
    allNetworkErrors: string[]
  ): void {
    // Severity: auth/admin/checkout endpoints are high; everything else medium.
    const severity: Severity = allNetworkErrors.some((e) =>
      /\/(api\/auth|api\/admin|api\/login|api\/signup|api\/checkout)/i.test(e)
    )
      ? "high"
      : "medium";

    // Build repro steps from the actual step sequence so they're actionable.
    const reproSteps = stepLogs.map(
      (s, i) => `${i + 1}. ${s.action} ${s.target}${s.value !== undefined ? ` value="${s.value}"` : ""}`
    );

    const bug = this.state.reportBug({
      title: `[Auto] Server error(s) during: ${test.title}`,
      severity,
      impact:
        "Backend returned a 5xx response. The feature is broken for all users " +
        "triggering this path. The frontend may display a generic error or " +
        "silently fail while the server crashes.",
      reproSteps,
      expected: "All API calls complete with 2xx status",
      actual: allNetworkErrors.join("; "),
      url: stepLogs[0]?.url ?? this.opts.url,
      testId,
    });
    bug.source = "analysis";
    bug.evidence = {
      error: allNetworkErrors[0] ?? "",
      logs: stepLogs
        .filter((s) => (s.networkErrors ?? []).length > 0)
        .map((s) => ({ step: s.index + 1, errors: s.networkErrors })),
    };
    this.emit("bug_reported", { bug, source: "network_error_auto" });
  }

  private autoreportAuthBypass(
    test: TestCase,
    testId: string,
    finalUrl: string
  ): void {
    const reproSteps = test.steps.map(
      (s, i) => `${i + 1}. ${s.action} ${s.target}${s.value !== undefined ? ` value="${s.value}"` : ""}`
    );
    
    const bug = this.state.reportBug({
      title: `[Auto] Auth bypass during: ${test.title}`,
      severity: "high",
      impact:
        "Server accepted invalid or empty credentials and granted access to a " +
        "protected page. Any user can bypass authentication.",
      reproSteps,
      expected: "Server rejects invalid credentials; user stays on login page with an error",
      actual: `Server redirected to ${finalUrl} after invalid credential submission`,
      url: test.steps[0]?.target ?? this.opts.url,
      testId,
    });
    bug.source = "analysis";
    bug.evidence = {
      error: `Landed on protected URL: ${finalUrl}`,
      logs: { finalUrl, steps: reproSteps },
    };
    this.emit("bug_reported", { bug, source: "auth_bypass_auto" });
  }

  private autoreportRaceCondition(
    test: TestCase,
    testId: string,
    selector: string,
    url: string
  ): void {
    const bug = this.state.reportBug({
      title: `[Auto] Race condition on ${selector}: button clickable before JS disables it`,
      severity: "medium",
      impact:
        "A button that should be disabled on page load has a brief window where " +
        "it can be clicked. Users or bots hitting the page quickly can trigger " +
        "actions that should be blocked.",
      reproSteps: [
        `1. Navigate to ${url}`,
        `2. Immediately click_immediate ${selector} (within ~150ms of load)`,
        `3. Observe: click fires successfully; element is disabled after the fact`,
      ],
      expected: `${selector} is disabled immediately on page load`,
      actual: "Element accepted click_immediate and was only disabled after the click fired",
      url,
      testId,
    });
    bug.source = "analysis";
    bug.evidence = {
      error: `Race window confirmed: wasDisabledAfterClick=true on ${selector}`,
      logs: { selector, url },
    };
    this.emit("bug_reported", { bug, source: "race_condition_auto" });
  }

  private recordSlowNavigation(url: string, durationMs: number): void {
    const existing = this.slowNavigations.get(url) ?? [];
    existing.push(durationMs);
    this.slowNavigations.set(url, existing);

    if (existing.length >= 2 && existing.every((d) => d > 2000)) {
      const avg = Math.round(existing.reduce((a, b) => a + b, 0) / existing.length);
      const bug = this.state.reportBug({
        title: `[Auto] Slow page load: ${url}`,
        severity: "low",
        impact: "Page takes over 2s to load, degrading user experience.",
        reproSteps: [`1. navigate ${url}`],
        expected: "Page loads in under 2000ms",
        actual: `Page averaged ${avg}ms across ${existing.length} visits`,
        url,
      });
      bug.source = "analysis";
      bug.evidence = {
        error: `Slow load times: ${existing.join("ms, ")}ms`,
        logs: { samples: existing },
      };
      this.emit("bug_reported", { bug, source: "perf_auto" });
    }
  }

  // Cross-layer detection: when a 5xx fires on a form submission, the same
  // root cause often manifests at the frontend as a missing `required`
  // attribute. We file a separate low-severity bug for each unguarded field
  // so the developer can fix both layers in one pass.
  private autoreportFrontendValidationGap(
    test: TestCase,
    testId: string,
    url: string
  ): void {
    // Find the form on this URL that the test was submitting.
    const form = this.state.model.forms.find(
      (f) => url.startsWith(f.url) || f.url === url
    );
    if (!form) return;

    // Skip search-style forms (GET method). These are intentionally
    // optional — flagging the search-query field as "missing required" is
    // a false positive (e.g. the `q` field on /products.html).
    if (form.method.toLowerCase() === "get") return;

    // Selectors that received a non-empty value via type steps in this test.
    const typedSelectors = new Set<string>();
    for (const step of test.steps) {
      if (
        step.action === "type" &&
        typeof step.value === "string" &&
        step.value.trim().length > 0
      ) {
        typedSelectors.add(step.target);
      }
    }

    // Fields that were NOT typed into AND lack required=true on the form.
    // These are the unguarded fields that let empty input reach the server.
    const gappyFields = form.fields.filter(
      (f) => !typedSelectors.has(f.selector) && !f.required
    );
    if (gappyFields.length === 0) return;

    for (const field of gappyFields) {
      const bug = this.state.reportBug({
        title: `[Auto] Frontend validation gap: '${field.name}' field not marked required`,
        severity: "low",
        impact:
          "The frontend allowed an empty value for this field to reach the " +
          "backend, which then crashed (see linked server bug). Marking the " +
          "field as required in the form HTML would prevent the server-side " +
          "error from ever firing.",
        reproSteps: [
          `1. Navigate to ${url}`,
          `2. Submit the form leaving '${field.name}' (${field.selector}) empty`,
          `3. Observe: server returns a 5xx instead of the form blocking the submission`,
        ],
        expected: `Field '${field.name}' should have required="true" or client-side validation`,
        actual: `Field has required=false; empty value reached the server`,
        url,
        testId,
      });
      bug.source = "analysis";
      bug.evidence = {
        error: `Frontend validation gap: ${field.selector} accepted empty input`,
        logs: {
          fieldName: field.name,
          selector: field.selector,
          formUrl: form.url,
          formPurpose: form.purpose,
        },
      };
      this.emit("bug_reported", { bug, source: "frontend_gap_auto" });
    }
  }

  // Accessibility detector: checks for WCAG violations (missing alt text, no labels, low contrast)
  private autoreportAccessibilityBug(
    test: TestCase,
    testId: string,
    violations: Array<{ selector: string; type: string; html: string; ariaLabel?: string; contrastRatio?: number }>,
    url: string
  ): void {
    if (violations.length === 0) return;

    const reproSteps = test.steps.map(
      (s, i) => `${i + 1}. ${s.action} ${s.target}${s.value !== undefined ? ` value="${s.value}"` : ""}`
    );

    const violationSummary = violations.map((v) => `${v.type} on ${v.selector}`).join("; ");

    const bug = this.state.reportBug({
      title: `[Auto] Accessibility violation(s): ${violationSummary}`,
      severity: test.type === "authentication" ? "high" : "medium",
      impact:
        "Component lacks proper accessibility attributes (alt text, aria-labels, etc). " +
        "Screen reader users cannot access this feature. Violates WCAG guidelines.",
      reproSteps,
      expected: "All interactive elements have proper ARIA labels and alt text; color contrast >= 4.5:1",
      actual: `Found ${violations.length} accessibility violation(s): ${violationSummary}`,
      url,
      testId,
    });
    bug.source = "analysis";
    bug.type = "accessibility";
    bug.evidence = {
      error: `Accessibility violations: ${violationSummary}`,
      wcagLevel: "AA",
      violationType: violations[0]?.type as any,
      element: {
        selector: violations[0]?.selector ?? "",
        html: violations[0]?.html ?? "",
        ariaLabel: violations[0]?.ariaLabel,
        contrastRatio: violations[0]?.contrastRatio,
      },
      logs: violations,
    };
    this.emit("bug_reported", { bug, source: "accessibility_auto" });
  }

  // Security detector: checks for XSS, CSRF, secrets exposure, missing security headers
  private autoreportSecurityBug(
    test: TestCase,
    testId: string,
    securityType: string,
    evidence: string,
    url: string,
    payload?: string,
    responseSnippet?: string
  ): void {
    const severityMap: Record<string, Severity> = {
      xss: "critical",
      injection: "critical",
      csrf: "high",
      "secrets-exposure": "high",
      "missing-security-headers": "medium",
      "insecure-cookie": "medium",
    };

    const reproSteps = test.steps.map(
      (s, i) => `${i + 1}. ${s.action} ${s.target}${s.value !== undefined ? ` value="${s.value}"` : ""}`
    );

    const bug = this.state.reportBug({
      title: `[Auto] Security vulnerability: ${securityType}`,
      severity: severityMap[securityType] || "medium",
      impact:
        securityType === "xss"
          ? "Attacker can inject JavaScript that executes in victim browsers, steal session tokens, or deface content."
          : securityType === "csrf"
            ? "Attacker can forge requests on behalf of authenticated users to perform unauthorized actions."
            : "Sensitive data (API keys, credentials, PII) is exposed in HTTP responses or logs.",
      reproSteps,
      expected: "All user inputs are sanitized; security headers present; no secrets in responses",
      actual: evidence,
      url,
      testId,
    });
    bug.source = "analysis";
    bug.type = "security";
    bug.evidence = {
      error: evidence,
      securityType: securityType as any,
      securityPayload: payload,
      securityResponse: responseSnippet,
      logs: { type: securityType, evidence },
    };
    this.emit("bug_reported", { bug, source: "security_auto" });
  }

  // SEO & Performance detector: checks for missing meta tags, slow page loads, unoptimized assets
  private autoreportSeoPerf(
    test: TestCase,
    testId: string,
    seoIssues: string[],
    webVitals: Record<string, number>,
    unoptimizedAssets: Array<{ url: string; type: string; size: number }>,
    url: string
  ): void {
    const allIssues = [...(seoIssues.length > 0 ? ["SEO"] : [])];
    const perfIssues = Object.entries(webVitals)
      .filter(([key, val]) => {
        if (key === "cls") return val > 0.1; // High CLS
        if (key === "lcp") return val > 2500; // Slow LCP
        if (key === "fcp") return val > 1800; // Slow FCP
        return false;
      })
      .map(([key]) => key.toUpperCase());

    if (perfIssues.length > 0) allIssues.push("Performance");
    if (unoptimizedAssets.length > 0) allIssues.push("Asset Optimization");

    const reproSteps = test.steps.map(
      (s, i) => `${i + 1}. ${s.action} ${s.target}${s.value !== undefined ? ` value="${s.value}"` : ""}`
    );

    const severity: Severity =
      (webVitals.cls ?? 0) > 0.1 || (webVitals.lcp ?? 0) > 3000 ? "high" : "medium";

    const bug = this.state.reportBug({
      title: `[Auto] SEO & Performance issue: ${allIssues.join(" + ")}`,
      severity,
      impact:
        severity === "high"
          ? "Page is slow or visually unstable, leading to poor user experience and lower search rankings."
          : "Page lacks SEO metadata or has unoptimized assets, reducing discoverability and performance.",
      reproSteps,
      expected:
        "Page has title, meta-description, good Core Web Vitals (CLS<0.1, LCP<2.5s, FCP<1.8s), and optimized assets",
      actual: allIssues.join("; ") + (seoIssues.length > 0 ? `: ${seoIssues.join(", ")}` : ""),
      url,
      testId,
    });
    bug.source = "analysis";
    bug.type = "seo";
    bug.evidence = {
      error: `SEO & Performance issues detected`,
      seoIssues,
      webVitals: {
        fcp: webVitals.fcp,
        lcp: webVitals.lcp,
        cls: webVitals.cls,
      },
      unoptimizedAssets:
        unoptimizedAssets.length > 0
          ? unoptimizedAssets.map((a) => ({
              url: a.url,
              type: a.type,
              size: a.size,
            }))
          : undefined,
      resources: {
        totalSize: unoptimizedAssets.reduce((sum, a) => sum + a.size, 0),
        count: unoptimizedAssets.length,
        unoptimized: unoptimizedAssets.length,
      },
      logs: { seoIssues, webVitals, unoptimizedAssets },
    };
    this.emit("bug_reported", { bug, source: "seo_perf_auto" });
  }

  // ── Deterministic test seeding ─────────────────────────────────────────
  //
  // The LLM picks tests non-deterministically. Across runs it sometimes
  // skips the exact inputs that trigger known bug classes. These seeders
  // queue the high-yield adversarial tests in code so coverage is stable
  // regardless of which model is driving.

  // Adversarial form variants: empty-field probes, malformed-email probes,
  // and length-overflow probes. Skips GET-method (search) forms — those
  // get the dedicated search-fuzz seeder below.
  private seedFormVariants(form: FormEntry): void {
    if (form.method.toLowerCase() === "get") {
      this.seedSearchFuzzVariants(form);
      return;
    }
    if (form.fields.length === 0) return;

    const submitTarget = form.submitSelector || "#submit";
    const placeholder = (type: string): string => {
      const t = type.toLowerCase();
      if (t === "email") return "qa.probe@example.com";
      if (t === "password") return "Password123!";
      if (t === "number") return "10";
      if (t === "tel") return "5555550100";
      return "QA Probe";
    };

    // 1) For each field, queue a test that fills the OTHERS and leaves it empty.
    for (const target of form.fields) {
      const steps: TestStep[] = [
        { action: "navigate", target: form.url, expected: "Page loads" },
      ];
      for (const f of form.fields) {
        if (f.selector === target.selector) continue;
        steps.push({
          action: "type",
          target: f.selector,
          value: placeholder(f.type),
          expected: `Filled ${f.name}`,
        });
      }
      steps.push({ action: "click", target: submitTarget, expected: "Submit attempted" });

      this.state.addTest({
        title: `[Seeded] ${form.purpose || form.url}: '${target.name}' left empty`,
        type: "form_validation",
        priority: "medium",
        expected: `Server should reject the submission with a 4xx, NOT crash with a 5xx`,
        steps,
      });
    }

    // 2) If the form has an email field, queue a `noatsign` probe that
    //    specifically triggers naive `email.split("@")[1]` crashes.
    const emailField = form.fields.find(
      (f) => f.type.toLowerCase() === "email" || f.name.toLowerCase() === "email"
    );
    if (emailField) {
      const steps: TestStep[] = [
        { action: "navigate", target: form.url, expected: "Page loads" },
      ];
      for (const f of form.fields) {
        const value = f.selector === emailField.selector ? "noatsign" : placeholder(f.type);
        steps.push({ action: "type", target: f.selector, value, expected: `Filled ${f.name}` });
      }
      steps.push({ action: "click", target: submitTarget, expected: "Submit attempted" });

      this.state.addTest({
        title: `[Seeded] ${form.purpose || form.url}: email='noatsign' (no @)`,
        type: "form_validation",
        priority: "high",
        expected: "Server validates email format and returns 4xx (NOT a 5xx TypeError)",
        steps,
      });
    }

    // 3) Length-overflow probe on the first text-like field.
    const textField = form.fields.find(
      (f) => f.type.toLowerCase() === "text" || f.type.toLowerCase() === "search"
    );
    if (textField) {
      const steps: TestStep[] = [
        { action: "navigate", target: form.url, expected: "Page loads" },
      ];
      for (const f of form.fields) {
        const value = f.selector === textField.selector ? "x".repeat(500) : placeholder(f.type);
        steps.push({ action: "type", target: f.selector, value, expected: `Filled ${f.name}` });
      }
      steps.push({ action: "click", target: submitTarget, expected: "Submit attempted" });

      this.state.addTest({
        title: `[Seeded] ${form.purpose || form.url}: 500-char overflow on '${textField.name}'`,
        type: "error_handling",
        priority: "medium",
        expected: "Server handles long input gracefully (4xx or 2xx, NOT a 5xx)",
        steps,
      });
    }
  }

  // GET-method (search) forms get the regex / SQL / overflow fuzz set.
  private seedSearchFuzzVariants(form: FormEntry): void {
    const queryField = form.fields[0];
    if (!queryField) return;
    const submitTarget = form.submitSelector || "button";

    const payloads: Array<{ value: string; label: string }> = [
      { value: "[(*?\\", label: "regex specials" },
      { value: "' OR 1=1 --", label: "SQL injection" },
      { value: "x".repeat(500), label: "500-char overflow" },
    ];

    for (const p of payloads) {
      this.state.addTest({
        title: `[Seeded] ${form.purpose || "Search"}: ${p.label}`,
        type: "error_handling",
        priority: "high",
        expected: "Server handles input safely (no 5xx crash)",
        steps: [
          { action: "navigate", target: form.url, expected: "Page loads" },
          { action: "type", target: queryField.selector, value: p.value, expected: "Payload typed" },
          { action: "click", target: submitTarget, expected: "Search submitted" },
        ],
      });
    }
  }

  // For each non-form button on a freshly-extracted page, queue a
  // click_immediate probe. Targets buttons like `button.add-to-cart` that
  // are wired up by JS and may have a transient enabled window.
  private seedClickImmediateProbes(pageUrl: string, extractData: unknown): void {
    if (!extractData || typeof extractData !== "object") return;
    const data = extractData as Record<string, unknown>;
    const buttons = Array.isArray(data.buttons) ? (data.buttons as Array<{ selector?: string; text?: string }>) : [];
    const formSubmitSelectors = new Set(
      this.state.model.forms.flatMap((f) => [f.submitSelector, f.selector]).filter(Boolean)
    );

    for (const btn of buttons) {
      if (!btn.selector || formSubmitSelectors.has(btn.selector)) continue;
      // Only probe action-style buttons (cart, buy, add, remove, delete).
      const txt = (btn.text || "").toLowerCase();
      const sel = btn.selector.toLowerCase();
      if (!/cart|buy|add|remove|delete|purchase|checkout/.test(txt + " " + sel)) continue;

      this.state.addTest({
        title: `[Seeded] Race probe: click_immediate ${btn.selector} on ${pageUrl}`,
        type: "regression",
        priority: "high",
        expected: "Button is disabled on load OR click is rejected by server validation",
        steps: [
          { action: "navigate", target: pageUrl, expected: "Page loads" },
          { action: "click_immediate", target: btn.selector, expected: "Race probe fires" },
        ],
      });
    }
  }
}

export async function runDeepAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const agent = new DeepAgent(opts);
  return agent.run();
}
