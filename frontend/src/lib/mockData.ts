// Mock data — shaped to match what the deep-agent backend would emit, so the
// store's contract works once the SSE wiring lands.

export type RunStatus = "running" | "completed" | "failed" | "queued";
export type StepKind =
  | "navigate"
  | "click"
  | "type"
  | "extract"
  | "screenshot"
  | "run_test"
  | "report_bug"
  | "analysis";
export type TestStatus = "passed" | "failed" | "running" | "queued";
export type Severity = "critical" | "high" | "medium" | "low";

export interface RunSummary {
  id: string;
  url: string;
  status: RunStatus;
  startedAt: string;
  durationMs?: number;
  testCount: number;
  bugCount: number;
}

export interface ExecutionStep {
  id: string;
  step: number;
  kind: StepKind;
  target?: string;
  reason?: string;
  result: "success" | "failure";
  detail?: string;
  timestamp: string;
}

export interface TestCase {
  id: string;
  title: string;
  type:
    | "smoke"
    | "navigation"
    | "authentication"
    | "form_validation"
    | "crud"
    | "error_handling"
    | "regression";
  priority: "high" | "medium" | "low";
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

const now = Date.now();
const ago = (sec: number) => new Date(now - sec * 1000).toISOString();

export const MOCK_RUNS: RunSummary[] = [
  {
    id: "run_004",
    url: "https://app.acme-shop.com",
    status: "running",
    startedAt: ago(34),
    testCount: 8,
    bugCount: 1,
  },
  {
    id: "run_003",
    url: "https://staging.atlas.dev",
    status: "completed",
    startedAt: ago(60 * 14),
    durationMs: 3 * 60 * 1000,
    testCount: 12,
    bugCount: 2,
  },
  {
    id: "run_002",
    url: "https://demo.example.io/dashboard",
    status: "failed",
    startedAt: ago(60 * 60 * 2),
    durationMs: 95 * 1000,
    testCount: 5,
    bugCount: 4,
  },
  {
    id: "run_001",
    url: "http://localhost:3000",
    status: "completed",
    startedAt: ago(60 * 60 * 24),
    durationMs: 2 * 60 * 1000,
    testCount: 9,
    bugCount: 0,
  },
];

export const MOCK_STEPS: ExecutionStep[] = [
  {
    id: "s1",
    step: 1,
    kind: "navigate",
    target: "https://app.acme-shop.com",
    reason: "Reach the homepage and learn the layout.",
    result: "success",
    detail: "200 OK · 384ms",
    timestamp: ago(32),
  },
  {
    id: "s2",
    step: 2,
    kind: "extract",
    target: "page",
    reason: "Discover routes, forms, and primary actions.",
    result: "success",
    detail: "headings=12 · links=24 · forms=2 · buttons=18",
    timestamp: ago(30),
  },
  {
    id: "s3",
    step: 3,
    kind: "click",
    target: "a[href='/login']",
    reason: "Begin auth flow exploration.",
    result: "success",
    detail: "navigated to /login (200)",
    timestamp: ago(27),
  },
  {
    id: "s4",
    step: 4,
    kind: "type",
    target: "input[name='email']",
    reason: "Smoke test login form with valid input.",
    result: "success",
    detail: 'value="qa+1@acme.test"',
    timestamp: ago(24),
  },
  {
    id: "s5",
    step: 5,
    kind: "type",
    target: "input[name='password']",
    reason: "Continue auth smoke test.",
    result: "success",
    detail: "value=••••••••••",
    timestamp: ago(22),
  },
  {
    id: "s6",
    step: 6,
    kind: "click",
    target: "button[type='submit']",
    reason: "Submit login form.",
    result: "success",
    detail: "navigated to /dashboard (200)",
    timestamp: ago(19),
  },
  {
    id: "s7",
    step: 7,
    kind: "run_test",
    target: "TC_002 — login with empty password rejects",
    reason: "Validate negative auth path.",
    result: "failure",
    detail: 'expected error toast, got navigation to /dashboard',
    timestamp: ago(14),
  },
  {
    id: "s8",
    step: 8,
    kind: "report_bug",
    target: "BUG_001",
    reason: "Empty-password submit bypasses validation.",
    result: "success",
    detail: "severity=high · linked TC_002",
    timestamp: ago(12),
  },
  {
    id: "s9",
    step: 9,
    kind: "extract",
    target: "page",
    reason: "Map dashboard widgets for further coverage.",
    result: "success",
    detail: "discovered 3 entities, 6 routes",
    timestamp: ago(8),
  },
  {
    id: "s10",
    step: 10,
    kind: "run_test",
    target: "TC_003 — primary nav opens each main route",
    reason: "Verify navigation smoke path.",
    result: "success",
    detail: "5/5 routes returned 200",
    timestamp: ago(4),
  },
];

export const MOCK_TESTS: TestCase[] = [
  {
    id: "TC_001",
    title: "Homepage loads with hero copy and CTA",
    type: "smoke",
    priority: "high",
    status: "passed",
    attempts: 1,
    expected: "h1 visible within 5s, primary CTA enabled",
  },
  {
    id: "TC_002",
    title: "Login with empty password is rejected",
    type: "form_validation",
    priority: "high",
    status: "failed",
    attempts: 2,
    expected: "Inline validation message; no navigation",
  },
  {
    id: "TC_003",
    title: "Primary nav opens each main route",
    type: "navigation",
    priority: "medium",
    status: "passed",
    attempts: 1,
    expected: "All 5 routes return 200 with no console errors",
  },
  {
    id: "TC_004",
    title: "Create new product via /admin/products",
    type: "crud",
    priority: "high",
    status: "running",
    attempts: 1,
    expected: "Item appears in list after submit",
  },
  {
    id: "TC_005",
    title: "Logout clears session and redirects to /",
    type: "authentication",
    priority: "medium",
    status: "queued",
    attempts: 0,
    expected: "Cookie cleared; navigation to home",
  },
  {
    id: "TC_006",
    title: "Search returns relevant results within 2s",
    type: "smoke",
    priority: "low",
    status: "passed",
    attempts: 1,
    expected: "Results visible; no skeleton after 2s",
  },
  {
    id: "TC_007",
    title: "404 page renders for unknown route",
    type: "error_handling",
    priority: "medium",
    status: "passed",
    attempts: 1,
    expected: "404 status code and friendly UI",
  },
  {
    id: "TC_008",
    title: "Cart total updates when quantity changes",
    type: "regression",
    priority: "medium",
    status: "queued",
    attempts: 0,
    expected: "Subtotal updates without page reload",
  },
];

export const MOCK_BUGS: Bug[] = [
  {
    id: "BUG_001",
    title: "Login form accepts empty password and navigates to dashboard",
    severity: "high",
    description:
      "Submitting the login form with a non-empty email and an empty password navigates the user to /dashboard instead of surfacing a validation error.",
    reproSteps: [
      "Open https://app.acme-shop.com/login",
      "Fill email with qa+1@acme.test",
      "Leave password empty",
      "Click submit",
    ],
    expected:
      'Inline validation "Password is required"; user remains on /login.',
    actual:
      "Form submits successfully (200) and the app navigates to /dashboard with a partial session.",
    testId: "TC_002",
    url: "https://app.acme-shop.com/login",
  },
  {
    id: "BUG_002",
    title: "Primary CTA briefly clickable while disabled (race condition)",
    severity: "medium",
    description:
      "On slow networks the hero CTA is mounted in an enabled state for ~150ms before the disabled attribute is applied.",
    reproSteps: [
      "Throttle network to 'Fast 3G'",
      "Navigate to https://app.acme-shop.com",
      "Click the hero CTA within 200ms of load",
    ],
    expected: "CTA is disabled or blocks interaction during initialization.",
    actual: "Click handler fires and submits an empty payload.",
    url: "https://app.acme-shop.com",
  },
  {
    id: "BUG_003",
    title: "/admin/products returns 500 on POST without category",
    severity: "critical",
    description:
      "Submitting the product creation form without a category yields an unhandled server error instead of a validation response.",
    reproSteps: [
      "Open /admin/products",
      "Fill name and price only",
      "Click Save",
    ],
    expected: "400 with field-level error message.",
    actual: "500 Internal Server Error; product is not created.",
    url: "https://app.acme-shop.com/admin/products",
  },
];
