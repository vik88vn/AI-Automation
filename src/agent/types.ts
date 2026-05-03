// Internal application model that the agent maintains across iterations.
// Updated via the record_observation tool; never overwritten wholesale.

export interface RouteEntry {
  url: string;
  title: string;
  status: number;
  notes: string;
  visitedAt: string;
}

export interface AuthState {
  hasLogin: boolean;
  hasSignup: boolean;
  hasLogout: boolean;
  loginUrl?: string;
  signupUrl?: string;
  loggedIn: boolean;
  notes: string;
}

export interface EntityEntry {
  name: string;
  fields: string[];
  routes: string[];
  notes: string;
}

export interface FlowEntry {
  name: string;
  steps: string[];
  startUrl: string;
  status: "discovered" | "verified" | "broken";
}

export interface FormFieldInfo {
  name: string;
  type: string;
  required: boolean;
  selector: string;
}

export interface FormEntry {
  url: string;
  selector: string;
  method: string;
  fields: FormFieldInfo[];
  submitSelector: string;
  purpose: string;
}

export interface AppModel {
  startUrl: string;
  routes: RouteEntry[];
  auth: AuthState;
  entities: EntityEntry[];
  flows: FlowEntry[];
  forms: FormEntry[];
}

export type TestType =
  | "smoke"
  | "navigation"
  | "authentication"
  | "form_validation"
  | "crud"
  | "error_handling"
  | "regression";

export type Priority = "high" | "medium" | "low";

export interface TestStep {
  action: "navigate" | "click" | "type" | "extract" | "screenshot";
  target: string;
  value?: string;
  expected?: string;
}

export interface TestCase {
  id: string;
  title: string;
  steps: TestStep[];
  expected: string;
  type: TestType;
  priority: Priority;
  status: "queued" | "running" | "passed" | "failed";
  attempts: number;
  lastError?: string;
  failedStepIndex?: number;
}

export type Severity = "critical" | "high" | "medium" | "low";

export interface BugEvidence {
  error: string;
  logs: unknown;
}

export interface BugReport {
  id: string;
  title: string;
  severity: Severity;
  impact: string;
  reproSteps: string[];
  expected: string;
  actual: string;
  url: string;
  screenshot?: string;
  testId?: string;
  reportedAt: string;
  evidence?: BugEvidence;
  source?: "agent" | "analysis";
}

// Result of post-test analysis classifying a single failure.
export type FailureCategory =
  | "disabled_element"
  | "hidden_element"
  | "element_not_visible"
  | "real_bug";

export interface TestIssue {
  testId: string;
  testTitle: string;
  category: "disabled_element" | "hidden_element" | "element_not_visible";
  reason: string;
  failedStepIndex: number;
  failedStep: TestStep;
  error: string;
}

export interface CorrectedTest {
  originalId: string;
  originalTitle: string;
  rationale: string;
  corrected: TestCase;
}

export interface AnalysisSummary {
  total: number;
  passed: number;
  failed: number;
  realBugs: number;
  falseFailures: number;
}

export interface AnalysisResult {
  bugs: BugReport[];
  testIssues: TestIssue[];
  correctedTests: CorrectedTest[];
  summary: AnalysisSummary;
}

// Browser tool action — the format the user specified.
export type BrowserAction = "navigate" | "click" | "type" | "extract" | "screenshot";

export interface BrowserToolInput {
  action: BrowserAction;
  target: string;
  value?: string;
  reason: string;
}

export interface BrowserToolResult {
  ok: boolean;
  action: BrowserAction;
  target: string;
  url: string;
  title: string;
  data?: unknown;
  error?: string;
  durationMs: number;
  screenshotPath?: string;
}

// Events streamed to the dashboard via SSE.
export type AgentEventType =
  | "run_start"
  | "step_start"
  | "tool_call"
  | "tool_result"
  | "model_update"
  | "test_added"
  | "test_started"
  | "test_passed"
  | "test_failed"
  | "test_retry"
  | "bug_reported"
  | "test_issue_identified"
  | "corrected_test_generated"
  | "analysis_complete"
  | "log"
  | "run_end"
  | "run_error";

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  step: number;
  payload: unknown;
}

// Re-exported from llm.ts to avoid circular imports in callers.
export type ProviderName = "anthropic" | "openai" | "ollama";

export type ProviderConfig =
  | { provider: "anthropic"; apiKey: string; model?: string }
  | { provider: "openai"; apiKey: string; model?: string; baseUrl?: string }
  | { provider: "ollama"; model?: string; baseUrl?: string };

export interface AgentRunOptions {
  url: string;
  provider: ProviderConfig;
  maxSteps?: number;
  headless?: boolean;
  reportDir?: string;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  ok: boolean;
  steps: number;
  stoppedReason: string;
  model: AppModel;
  tests: TestCase[];
  bugs: BugReport[];
  analysis?: AnalysisResult;
  events: AgentEvent[];
  reportJsonPath?: string;
  reportMdPath?: string;
}
