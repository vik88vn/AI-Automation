export interface RouteInfo {
  url: string;
  title: string;
  depth: number;
  status: number;
}

export interface InputInfo {
  name: string;
  type: string;
  selector: string;
  required: boolean;
  placeholder: string;
  label: string;
}

export interface FormInfo {
  url: string;
  selector: string;
  action: string;
  method: string;
  inputs: InputInfo[];
  submitSelector: string;
}

export interface FlowInfo {
  name: string;
  description: string;
  startUrl: string;
}

export interface ExplorationResult {
  startUrl: string;
  routes: RouteInfo[];
  flows: FlowInfo[];
  forms: FormInfo[];
  features: string[];
}

export type StepAction =
  | "navigate"
  | "click"
  | "fill"
  | "select"
  | "wait_for_selector"
  | "wait_for_url"
  | "assert_visible"
  | "assert_text"
  | "assert_url"
  | "assert_status";

export interface TestStep {
  action: StepAction;
  description: string;
  selector?: string;
  value?: string;
  url?: string;
  expected?: string;
  timeoutMs?: number;
}

export type TestType =
  | "authentication"
  | "navigation"
  | "crud"
  | "form_validation"
  | "error_handling"
  | "smoke";

export type Priority = "high" | "medium" | "low";

export interface TestCase {
  id: string;
  title: string;
  steps: TestStep[];
  expected: string;
  type: TestType;
  priority: Priority;
}

export type TestStatus = "PASS" | "FAIL";

export interface TestResult {
  id: string;
  title: string;
  type: TestType;
  priority: Priority;
  status: TestStatus;
  logs: string[];
  error: string;
  durationMs: number;
  attempts: number;
  screenshot?: string;
  failedStepIndex?: number;
}

export type Severity = "critical" | "high" | "medium" | "low";

export interface BugEvidence {
  screenshot?: string;
  logs?: string[];
  error?: string;
  url?: string;
}

export interface Bug {
  title: string;
  severity: Severity;
  impact: string;
  steps_to_reproduce: string[];
  expected: string;
  actual: string;
  evidence: BugEvidence;
}

export interface QASummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

export interface QAReport {
  url: string;
  timestamp: string;
  durationMs: number;
  summary: QASummary;
  exploration: ExplorationResult;
  testCases: TestCase[];
  results: TestResult[];
  bugs: Bug[];
}

export interface QAOptions {
  url: string;
  apiKey?: string;
  model?: string;
  headless?: boolean;
  maxDepth?: number;
  maxPages?: number;
  testTimeoutMs?: number;
  reportDir?: string;
  minTestCases?: number;
  maxTestCases?: number;
}

export interface QARunResult {
  report: QAReport;
  reportDir: string;
  jsonPath: string;
  markdownPath: string;
}
