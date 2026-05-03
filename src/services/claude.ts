import Anthropic from "@anthropic-ai/sdk";
import type { ExplorationResult, TestCase } from "../types.js";
import { Logger } from "../utils/logger.js";

const DEFAULT_MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `You are an expert QA engineer generating end-to-end test cases for a web application.

You receive an automated exploration of a live site (routes, forms, inputs, detected features) and produce a test plan that covers:
  - Authentication flows (login, signup, logout, session)
  - Navigation between primary routes
  - CRUD operations against any forms or list interfaces
  - Form validation (required fields, invalid input, boundary cases)
  - Error handling (404 pages, server errors, network failures)
  - Smoke checks for critical user paths

Strict rules:
  1. Output ONLY valid JSON matching the requested schema. No prose, no markdown fences.
  2. Use selectors that already appear in the exploration data when possible. If you must invent a selector, prefer text= selectors (Playwright text engine) or role-based descriptions.
  3. Each test case must be independently executable from a fresh browser session.
  4. The first step of every test must be a "navigate" action to a concrete URL from the exploration.
  5. Steps must be deterministic — no random data, no timing-dependent assertions, no arbitrary sleeps.
  6. For form validation tests, use realistic invalid values (empty strings, malformed emails, etc.).
  7. Prefer wait_for_selector / wait_for_url / assert_visible over fixed timeouts.

Allowed step actions: navigate, click, fill, select, wait_for_selector, wait_for_url, assert_visible, assert_text, assert_url, assert_status.

Allowed test types: authentication, navigation, crud, form_validation, error_handling, smoke.
Allowed priorities: high, medium, low.

Respond with a JSON object: { "tests": TestCase[] }.`;

export interface ClaudeClientOptions {
  apiKey?: string;
  model?: string;
}

export class ClaudeClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly log = new Logger("claude");

  constructor(opts: ClaudeClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Pass apiKey via options or export the env var."
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async generateTestPlan(
    exploration: ExplorationResult,
    opts: { minCases: number; maxCases: number }
  ): Promise<TestCase[]> {
    const userPrompt = this.buildUserPrompt(exploration, opts);
    this.log.info("Requesting test plan from Claude", {
      model: this.model,
      routes: exploration.routes.length,
      forms: exploration.forms.length,
      features: exploration.features.length,
    });

    // Stream to avoid HTTP timeouts on larger plans, then collect the final message.
    // System prompt is cached — it's stable across requests, so prefix-match caching kicks in.
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const message = await stream.finalMessage();

    const usage = message.usage;
    this.log.info("Test plan generated", {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens ?? 0,
      cache_create: usage.cache_creation_input_tokens ?? 0,
      stop_reason: message.stop_reason,
    });

    const text = extractText(message);
    return this.parsePlan(text);
  }

  private buildUserPrompt(
    exploration: ExplorationResult,
    opts: { minCases: number; maxCases: number }
  ): string {
    const compact = compactExploration(exploration);
    return [
      `Target application: ${exploration.startUrl}`,
      `Generate between ${opts.minCases} and ${opts.maxCases} test cases.`,
      "",
      "Exploration data (JSON):",
      "```json",
      JSON.stringify(compact, null, 2),
      "```",
      "",
      'Return JSON of the form: {"tests":[{"id":"TC_001","title":"...","steps":[...],"expected":"...","type":"...","priority":"high|medium|low"}]}.',
      "Use sequential IDs TC_001, TC_002, ...",
    ].join("\n");
  }

  private parsePlan(text: string): TestCase[] {
    const json = extractJsonObject(text);
    if (!json) {
      throw new Error(
        `Claude did not return parseable JSON. First 200 chars: ${text.slice(0, 200)}`
      );
    }
    const tests = Array.isArray(json.tests) ? json.tests : [];
    if (tests.length === 0) {
      throw new Error("Claude returned a plan with zero test cases.");
    }
    return tests.map((raw: unknown, idx: number) => normalizeTestCase(raw, idx));
  }
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function extractJsonObject(text: string): { tests?: unknown[] } | null {
  const trimmed = text.trim();
  const tryParse = (s: string): { tests?: unknown[] } | null => {
    try {
      return JSON.parse(s) as { tests?: unknown[] };
    } catch {
      return null;
    }
  };
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenceMatch) {
    const fenced = tryParse(fenceMatch[1]);
    if (fenced) return fenced;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = tryParse(trimmed.slice(start, end + 1));
    if (slice) return slice;
  }
  return null;
}

function normalizeTestCase(raw: unknown, idx: number): TestCase {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id =
    typeof r.id === "string" && r.id.trim().length > 0
      ? r.id
      : `TC_${String(idx + 1).padStart(3, "0")}`;
  const title = typeof r.title === "string" ? r.title : `Untitled test ${idx + 1}`;
  const expected = typeof r.expected === "string" ? r.expected : "";
  const type = normalizeType(r.type);
  const priority = normalizePriority(r.priority);
  const steps = Array.isArray(r.steps)
    ? r.steps.map(normalizeStep).filter((s): s is NonNullable<typeof s> => s !== null)
    : [];
  return { id, title, steps, expected, type, priority };
}

function normalizeStep(raw: unknown): TestCase["steps"][number] | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const action = typeof r.action === "string" ? r.action : "";
  const allowed = new Set([
    "navigate",
    "click",
    "fill",
    "select",
    "wait_for_selector",
    "wait_for_url",
    "assert_visible",
    "assert_text",
    "assert_url",
    "assert_status",
  ]);
  if (!allowed.has(action)) return null;
  return {
    action: action as TestCase["steps"][number]["action"],
    description: typeof r.description === "string" ? r.description : action,
    selector: typeof r.selector === "string" ? r.selector : undefined,
    value: typeof r.value === "string" ? r.value : undefined,
    url: typeof r.url === "string" ? r.url : undefined,
    expected: typeof r.expected === "string" ? r.expected : undefined,
    timeoutMs: typeof r.timeoutMs === "number" ? r.timeoutMs : undefined,
  };
}

function normalizeType(value: unknown): TestCase["type"] {
  const allowed: TestCase["type"][] = [
    "authentication",
    "navigation",
    "crud",
    "form_validation",
    "error_handling",
    "smoke",
  ];
  return (allowed as readonly string[]).includes(value as string)
    ? (value as TestCase["type"])
    : "smoke";
}

function normalizePriority(value: unknown): TestCase["priority"] {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

function compactExploration(exploration: ExplorationResult): unknown {
  return {
    startUrl: exploration.startUrl,
    routes: exploration.routes.slice(0, 20).map((r) => ({
      url: r.url,
      title: r.title,
      depth: r.depth,
      status: r.status,
    })),
    forms: exploration.forms.slice(0, 12).map((f) => ({
      url: f.url,
      selector: f.selector,
      method: f.method,
      action: f.action,
      submitSelector: f.submitSelector,
      inputs: f.inputs.map((i) => ({
        name: i.name,
        type: i.type,
        selector: i.selector,
        required: i.required,
        placeholder: i.placeholder,
        label: i.label,
      })),
    })),
    flows: exploration.flows,
    features: exploration.features,
  };
}
