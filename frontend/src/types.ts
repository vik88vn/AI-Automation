// ─────────────────────────────────────────────────────────────────────────────
// Domain types — single source of truth for both stores, mock data, and UI.
// Keeping these in one place lets us swap mock data for live SSE without
// retyping anything. No "magic" string literals — all enumerated values are
// expressed as `as const` objects with a derived union type.
// ─────────────────────────────────────────────────────────────────────────────

// ── View / navigation ────────────────────────────────────────────────────────

export const Views = {
  Home: "home",
  Dashboard: "dashboard",
} as const;
export type View = (typeof Views)[keyof typeof Views];

export const Tabs = {
  Execution: "execution",
  Tests: "tests",
  Bugs: "bugs",
} as const;
export type Tab = (typeof Tabs)[keyof typeof Tabs];

// ── Run lifecycle ────────────────────────────────────────────────────────────

export const RunStatuses = {
  Queued: "queued",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
} as const;
export type RunStatus = (typeof RunStatuses)[keyof typeof RunStatuses];

export const StepKinds = {
  Navigate: "navigate",
  Click: "click",
  Type: "type",
  Extract: "extract",
  Screenshot: "screenshot",
  RunTest: "run_test",
  ReportBug: "report_bug",
  Analysis: "analysis",
  // Meta-tools the agent calls (not browser actions but worth showing).
  RecordObservation: "record_observation",
  AddTest: "add_test",
  Finish: "finish",
} as const;
export type StepKind = (typeof StepKinds)[keyof typeof StepKinds];

export const StepResults = {
  Success: "success",
  Failure: "failure",
} as const;
export type StepResult = (typeof StepResults)[keyof typeof StepResults];

export const TestStatuses = {
  Passed: "passed",
  Failed: "failed",
  Running: "running",
  Queued: "queued",
} as const;
export type TestStatus = (typeof TestStatuses)[keyof typeof TestStatuses];

export const TestTypes = {
  Smoke: "smoke",
  Navigation: "navigation",
  Authentication: "authentication",
  FormValidation: "form_validation",
  Crud: "crud",
  ErrorHandling: "error_handling",
  Regression: "regression",
} as const;
export type TestType = (typeof TestTypes)[keyof typeof TestTypes];

export const Priorities = {
  High: "high",
  Medium: "medium",
  Low: "low",
} as const;
export type Priority = (typeof Priorities)[keyof typeof Priorities];

export const Severities = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
} as const;
export type Severity = (typeof Severities)[keyof typeof Severities];

// ── Domain entities ──────────────────────────────────────────────────────────

export interface ExecutionStep {
  id: string;
  step: number;
  kind: StepKind;
  target?: string;
  reason?: string;
  result: StepResult;
  detail?: string;
  timestamp: string;
}

export interface TestCase {
  id: string;
  title: string;
  type: TestType;
  priority: Priority;
  status: TestStatus;
  attempts: number;
  expected: string;
}

export interface Bug {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  reproSteps: string[];
  expected: string;
  actual: string;
  testId?: string;
  url: string;
}

// ── AppModel — mirrors the backend's internal model exactly so the
//    serialized snapshot is interchangeable with a real run's output. ─────────

export const FlowStatuses = {
  Discovered: "discovered",
  Verified: "verified",
  Broken: "broken",
} as const;
export type FlowStatus = (typeof FlowStatuses)[keyof typeof FlowStatuses];

export interface AppModelRoute {
  url: string;
  title: string;
  status: number;
  notes: string;
  visitedAt: string;
}

export interface AppModelAuth {
  hasLogin: boolean;
  hasSignup: boolean;
  hasLogout: boolean;
  loginUrl?: string;
  signupUrl?: string;
  loggedIn: boolean;
  notes: string;
}

export interface AppModelEntity {
  name: string;
  fields: string[];
  routes: string[];
  notes: string;
}

export interface AppModelFlow {
  name: string;
  steps: string[];
  startUrl: string;
  status: FlowStatus;
}

export interface AppModelField {
  name: string;
  type: string;
  required: boolean;
  selector: string;
}

export interface AppModelForm {
  url: string;
  selector: string;
  method: string;
  fields: AppModelField[];
  submitSelector: string;
  purpose: string;
}

export interface AppModel {
  startUrl: string;
  routes: AppModelRoute[];
  auth: AppModelAuth;
  entities: AppModelEntity[];
  flows: AppModelFlow[];
  forms: AppModelForm[];
}

// ── Run snapshot — the full per-run history payload ──────────────────────────

// Serializable view of everything the dashboard renders for one run.
// This is what gets stored in `Run.snapshot` so a click in the history list
// can fully hydrate the dashboard without a network call.
export interface RunSnapshot {
  steps: ExecutionStep[];
  testCases: TestCase[];
  bugs: Bug[];
  appModel: AppModel;
}

// The Run object the architect specified — id, url, timestamps, status, model.
// `snapshot` packs the per-run display data alongside; the spec calls out
// "the full AppModel JSON" which lives at `snapshot.appModel`.
export interface Run {
  id: string;
  url: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
  snapshot: RunSnapshot;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const emptyAppModel = (): AppModel => ({
  startUrl: "",
  routes: [],
  auth: {
    hasLogin: false,
    hasSignup: false,
    hasLogout: false,
    loggedIn: false,
    notes: "",
  },
  entities: [],
  flows: [],
  forms: [],
});

export const emptySnapshot = (): RunSnapshot => ({
  steps: [],
  testCases: [],
  bugs: [],
  appModel: emptyAppModel(),
});
