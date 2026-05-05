// Mock data — shaped to match the backend's emit contract. All types live in
// `src/types.ts`; this file only exports concrete instances.

import {
  RunStatuses,
  StepKinds,
  StepResults,
  TestStatuses,
  TestTypes,
  Priorities,
  Severities,
  FlowStatuses,
  type AppModel,
  type Bug,
  type ExecutionStep,
  type Run,
  type RunSnapshot,
  type TestCase,
} from "@/types";

// Re-export the most-used domain types so existing imports keep working.
// New code should import from "@/types" directly.
export type {
  AppModel,
  Bug,
  BugEvidence,
  ExecutionStep,
  FailureContext,
  PerformanceMetrics,
  Run,
  RunSnapshot,
  RunStatus,
  Severity,
  StepKind,
  TestCase,
  TestStatus,
  Priority,
} from "@/types";

const now = Date.now();
const ago = (sec: number) => new Date(now - sec * 1000).toISOString();

export const MOCK_APP_MODEL: AppModel = {
  startUrl: "https://app.acme-shop.com",
  routes: [
    { url: "https://app.acme-shop.com", title: "Acme Shop — home", status: 200, notes: "auto: extracted", visitedAt: ago(32) },
    { url: "https://app.acme-shop.com/login", title: "Sign in", status: 200, notes: "discovered via header link", visitedAt: ago(27) },
    { url: "https://app.acme-shop.com/dashboard", title: "Dashboard", status: 200, notes: "auth required; reached after login", visitedAt: ago(19) },
  ],
  auth: { hasLogin: true, hasSignup: true, hasLogout: true, loginUrl: "https://app.acme-shop.com/login", signupUrl: "https://app.acme-shop.com/signup", loggedIn: true, notes: "session cookie set after credential submit" },
  entities: [
    { name: "User", fields: ["id", "email", "passwordHash", "createdAt"], routes: ["/login", "/signup", "/account"], notes: "auth flow exposes email + password fields" },
    { name: "Product", fields: ["id", "name", "price", "category", "inventory"], routes: ["/products", "/admin/products"], notes: "admin CRUD discovered" },
  ],
  flows: [
    { name: "Sign in", steps: ["Click header 'Sign in'", "Fill email + password", "Submit form", "Land on /dashboard"], startUrl: "https://app.acme-shop.com", status: FlowStatuses.Verified },
    { name: "Create product (admin)", steps: ["Open /admin/products", "Fill name + price", "Submit"], startUrl: "https://app.acme-shop.com/admin/products", status: FlowStatuses.Discovered },
  ],
  forms: [
    {
      url: "https://app.acme-shop.com/login",
      selector: "form#login",
      method: "post",
      submitSelector: "button[type='submit']",
      purpose: "auth",
      fields: [
        { name: "email", type: "email", required: true, selector: "input[name='email']" },
        { name: "password", type: "password", required: true, selector: "input[name='password']" },
      ],
    },
  ],
};

export const MOCK_STEPS: ExecutionStep[] = [
  { id: "s1", step: 1, kind: StepKinds.Navigate, target: "https://app.acme-shop.com", reason: "Reach the homepage and learn the layout.", result: StepResults.Success, detail: "200 OK · 384ms", timestamp: ago(32) },
  { id: "s2", step: 2, kind: StepKinds.Extract, target: "page", reason: "Discover routes, forms, and primary actions.", result: StepResults.Success, detail: "headings=12 · links=24 · forms=2 · buttons=18", timestamp: ago(30) },
  { id: "s3", step: 3, kind: StepKinds.Click, target: "a[href='/login']", reason: "Begin auth flow exploration.", result: StepResults.Success, detail: "navigated to /login (200)", timestamp: ago(27) },
  { id: "s4", step: 4, kind: StepKinds.Type, target: "input[name='email']", reason: "Smoke test login form with valid input.", result: StepResults.Success, detail: 'value="qa+1@acme.test"', timestamp: ago(24) },
  { id: "s5", step: 5, kind: StepKinds.Type, target: "input[name='password']", reason: "Continue auth smoke test.", result: StepResults.Success, detail: "value=••••••••••", timestamp: ago(22) },
  { id: "s6", step: 6, kind: StepKinds.Click, target: "button[type='submit']", reason: "Submit login form.", result: StepResults.Success, detail: "navigated to /dashboard (200)", timestamp: ago(19) },
  { id: "s7", step: 7, kind: StepKinds.RunTest, target: "TC_002 — login with empty password rejects", reason: "Validate negative auth path.", result: StepResults.Failure, detail: "expected error toast, got navigation to /dashboard", timestamp: ago(14) },
  { id: "s8", step: 8, kind: StepKinds.ReportBug, target: "BUG_001", reason: "Empty-password submit bypasses validation.", result: StepResults.Success, detail: "severity=high · linked TC_002", timestamp: ago(12) },
  { id: "s9", step: 9, kind: StepKinds.Extract, target: "page", reason: "Map dashboard widgets for further coverage.", result: StepResults.Success, detail: "discovered 3 entities, 6 routes", timestamp: ago(8) },
  { id: "s10", step: 10, kind: StepKinds.RunTest, target: "TC_003 — primary nav opens each main route", reason: "Verify navigation smoke path.", result: StepResults.Success, detail: "5/5 routes returned 200", timestamp: ago(4) },
];

// ── Test cases ──────────────────────────────────────────────────────────────

export const MOCK_TESTS: TestCase[] = [
  { id: "TC_001", title: "Homepage loads with hero copy and CTA", type: TestTypes.Smoke, priority: Priorities.High, status: TestStatuses.Passed, attempts: 1, expected: "h1 visible within 5s, primary CTA enabled" },
  { id: "TC_002", title: "Login with empty password is rejected", type: TestTypes.FormValidation, priority: Priorities.High, status: TestStatuses.Failed, attempts: 2, expected: "Inline validation message; no navigation" },
  { id: "TC_003", title: "Primary nav opens each main route", type: TestTypes.Navigation, priority: Priorities.Medium, status: TestStatuses.Passed, attempts: 1, expected: "All 5 routes return 200 with no console errors" },
  { id: "TC_004", title: "Create new product via /admin/products", type: TestTypes.Crud, priority: Priorities.High, status: TestStatuses.Running, attempts: 1, expected: "Item appears in list after submit" },
  { id: "TC_005", title: "Logout clears session and redirects to /", type: TestTypes.Authentication, priority: Priorities.Medium, status: TestStatuses.Queued, attempts: 0, expected: "Cookie cleared; navigation to home" },
  { id: "TC_006", title: "Search returns relevant results within 2s", type: TestTypes.Smoke, priority: Priorities.Low, status: TestStatuses.Passed, attempts: 1, expected: "Results visible; no skeleton after 2s" },
  { id: "TC_007", title: "404 page renders for unknown route", type: TestTypes.ErrorHandling, priority: Priorities.Medium, status: TestStatuses.Passed, attempts: 1, expected: "404 status code and friendly UI" },
  { id: "TC_008", title: "Cart total updates when quantity changes", type: TestTypes.Regression, priority: Priorities.Medium, status: TestStatuses.Queued, attempts: 0, expected: "Subtotal updates without page reload" },
];

// ── Bugs ────────────────────────────────────────────────────────────────────

export const MOCK_BUGS: Bug[] = [
  {
    id: "BUG_001",
    title: "Login form accepts empty password and navigates to dashboard",
    severity: Severities.High,
    description:
      "Submitting the login form with a non-empty email and an empty password navigates the user to /dashboard instead of surfacing a validation error.",
    reproSteps: [
      "Open https://app.acme-shop.com/login",
      "Fill email with qa+1@acme.test",
      "Leave password empty",
      "Click submit",
    ],
    expected: 'Inline validation "Password is required"; user remains on /login.',
    actual:
      "Form submits successfully (200) and the app navigates to /dashboard with a partial session.",
    testId: "TC_002",
    url: "https://app.acme-shop.com/login",
    evidence: {
      error: "Expected validation toast to appear, navigated to /dashboard instead.",
      errorType: "AssertionError",
      stackTrace:
        "AssertionError: expected validation error toast\n  at validateLoginForm (login.ts:42:11)\n  at handleSubmit (login.ts:87:5)\n  at HTMLButtonElement.dispatch (event.ts:14:3)",
      logs: ["Form submitted with empty password", "Navigation to /dashboard initiated"],
      selectorAnalysis: {
        selector: "button[type='submit']",
        found: true,
        visible: true,
      },
    },
  },
  {
    id: "BUG_002",
    title: "Primary CTA briefly clickable while disabled (race condition)",
    severity: Severities.Medium,
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
    evidence: {
      error: "Click handler fired with disabled state pending.",
      errorType: "RaceConditionError",
      stackTrace:
        "RaceConditionError: button clicked before disabled flag applied\n  at HeroCTA.handleClick (hero.tsx:23:7)\n  at Object.invokeGuardedCallback (react-dom.js:118:9)",
      logs: ["CTA mounted with disabled=false", "Disabled attribute applied at +152ms"],
      selectorAnalysis: {
        selector: ".hero-cta",
        found: true,
        visible: true,
      },
    },
  },
  {
    id: "BUG_003",
    title: "/admin/products returns 500 on POST without category",
    severity: Severities.Critical,
    description:
      "Submitting the product creation form without a category yields an unhandled server error instead of a validation response.",
    reproSteps: ["Open /admin/products", "Fill name and price only", "Click Save"],
    expected: "400 with field-level error message.",
    actual: "500 Internal Server Error; product is not created.",
    url: "https://app.acme-shop.com/admin/products",
    evidence: {
      error: "POST /admin/products responded with 500 Internal Server Error",
      errorType: "ServerError",
      stackTrace:
        "ServerError: 500 Internal Server Error\n  at handleProductSubmit (products.ts:104:9)\n  at fetch (api.ts:55:3)",
      logs: [
        "POST https://app.acme-shop.com/admin/products → 500",
        "TypeError: Cannot read property 'category' of undefined",
      ],
      selectorAnalysis: {
        selector: "form#new-product",
        found: true,
        visible: true,
      },
    },
  },
];

const archived = (id: string, url: string, status: Run["status"], startedSec: number, endedSec: number | null, snapshot: RunSnapshot): Run => ({
  id,
  url,
  startedAt: ago(startedSec),
  endedAt: endedSec !== null ? ago(endedSec) : null,
  status,
  snapshot,
});

export const MOCK_RUN_HISTORY: Run[] = [
  archived("run_003", "https://staging.atlas.dev", RunStatuses.Completed, 60 * 14, 60 * 11, { steps: MOCK_STEPS.slice(0, 6), testCases: MOCK_TESTS.slice(0, 6), bugs: MOCK_BUGS.slice(0, 1), appModel: { ...MOCK_APP_MODEL, startUrl: "https://staging.atlas.dev" } }),
  archived("run_002", "https://demo.example.io/dashboard", RunStatuses.Failed, 60 * 60 * 2, 60 * 60 * 2 - 95, { steps: MOCK_STEPS.slice(0, 4), testCases: MOCK_TESTS.slice(0, 3), bugs: MOCK_BUGS, appModel: { ...MOCK_APP_MODEL, startUrl: "https://demo.example.io/dashboard" } }),
  archived("run_001", "http://localhost:3000", RunStatuses.Completed, 60 * 60 * 24, 60 * 60 * 24 - 120, { steps: MOCK_STEPS, testCases: MOCK_TESTS, bugs: [], appModel: { ...MOCK_APP_MODEL, startUrl: "http://localhost:3000" } }),
];

export const MOCK_ACTIVE_RUN: Run = {
  id: `run_${Date.now()}`,
  url: "",
  startedAt: null,
  endedAt: null,
  status: RunStatuses.Queued,
  snapshot: {
    steps: [],
    testCases: [],
    bugs: [],
    appModel: {
      startUrl: "",
      routes: [],
      auth: { hasLogin: false, hasSignup: false, hasLogout: false, loggedIn: false, notes: "" },
      entities: [],
      flows: [],
      forms: [],
    },
  },
};
