// Post-Test Analysis Layer.
//
// Classifies every failed TestCase deterministically (no LLM call) into one of:
//   - disabled_element  → testIssue, NOT a bug
//   - hidden_element    → testIssue, NOT a bug
//   - element_not_visible → testIssue, NOT a bug (timeout waiting for visibility)
//   - real_bug          → BugReport
//
// Existing test execution and Playwright layers are untouched. This module is
// pure: pass it test results, get back bugs / testIssues / correctedTests.

import type {
  AnalysisResult,
  AnalysisSummary,
  BugReport,
  CorrectedTest,
  FailureCategory,
  Severity,
  TestCase,
  TestIssue,
  TestStep,
} from "../types.js";

export interface AnalyzeOptions {
  appUrl: string;
  // Skip a test if a bug already exists for its testId (the agent reported it
  // mid-run). We still re-classify so the testIssue list is complete.
  alreadyReportedTestIds?: Set<string>;
}

export function analyzeResults(
  tests: TestCase[],
  opts: AnalyzeOptions
): AnalysisResult {
  const bugs: BugReport[] = [];
  const testIssues: TestIssue[] = [];
  const correctedTests: CorrectedTest[] = [];

  let bugSeq = 0;
  const nextBugId = (): string => {
    bugSeq += 1;
    return `BUG_A_${String(bugSeq).padStart(3, "0")}`;
  };

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    if (test.status === "passed") {
      passed += 1;
      continue;
    }
    if (test.status !== "failed") continue; // queued/running shouldn't reach here
    failed += 1;

    const error = test.lastError ?? "";
    const category = classifyFailure(error, test);

    if (category === "real_bug") {
      // Don't double-report: the agent may have already filed a bug for this
      // test mid-run via the report_bug tool.
      if (opts.alreadyReportedTestIds?.has(test.id)) continue;
      bugs.push(buildBugReport(nextBugId(), test, opts.appUrl));
    } else {
      const issue = buildTestIssue(test, category);
      if (!issue) continue;
      testIssues.push(issue);
      const corrected = generateCorrection(test, issue);
      if (corrected) correctedTests.push(corrected);
    }
  }

  const summary: AnalysisSummary = {
    total: tests.length,
    passed,
    failed,
    realBugs: bugs.length + (opts.alreadyReportedTestIds?.size ?? 0),
    falseFailures: testIssues.length,
  };

  return { bugs, testIssues, correctedTests, summary };
}

// ──────────────────────────────────────────────────────────────────────────────
// Classification — order matters: most-specific patterns first.
// ──────────────────────────────────────────────────────────────────────────────

export function classifyFailure(error: string, test: TestCase): FailureCategory {
  if (!error) return "real_bug";

  // Case A — Disabled element.
  // Playwright says "element is not enabled" when click target has the disabled
  // attribute or aria-disabled=true. We also catch the bare word "disabled" if
  // it appears alongside the failing element.
  if (/element is not enabled/i.test(error)) return "disabled_element";
  if (/element is disabled/i.test(error)) return "disabled_element";
  if (/\bdisabled\b/i.test(error) && /(button|element|target|locator)/i.test(error)) {
    return "disabled_element";
  }

  // Case B — Hidden element.
  // Playwright surfaces "element is hidden" or "not visible" when the element
  // is in the DOM but display:none / visibility:hidden / off-screen.
  if (/element is hidden/i.test(error)) return "hidden_element";
  if (/\bnot visible\b/i.test(error)) return "hidden_element";

  // Case C — Timeout waiting for the element to become visible.
  // The element exists in the DOM but never reached visible state within the
  // wait window — usually a missing prereq step (open tab, expand panel).
  if (/timeout.*waiting for/i.test(error) && /(visible|to be visible)/i.test(error)) {
    return "element_not_visible";
  }
  if (/waiting for selector .* to be visible/i.test(error)) {
    return "element_not_visible";
  }

  // Everything else — selector not found, navigation failure, 5xx response,
  // assertion mismatch, network error — is treated as a real bug.
  return "real_bug";
}

// ──────────────────────────────────────────────────────────────────────────────
// Builders
// ──────────────────────────────────────────────────────────────────────────────

const REASON_BY_CATEGORY: Record<TestIssue["category"], string> = {
  disabled_element: "Test attempted invalid action on disabled element",
  hidden_element: "Element requires UI state change (e.g., tab activation)",
  element_not_visible:
    "Element exists but never became visible — likely a missing prereq step",
};

function buildTestIssue(
  test: TestCase,
  category: FailureCategory
): TestIssue | null {
  if (category === "real_bug") return null;
  const idx = test.failedStepIndex ?? 0;
  const failedStep = test.steps[idx] ?? test.steps[0];
  if (!failedStep) return null;
  return {
    testId: test.id,
    testTitle: test.title,
    category,
    reason: REASON_BY_CATEGORY[category],
    failedStepIndex: idx,
    failedStep,
    error: test.lastError ?? "",
  };
}

function buildBugReport(
  id: string,
  test: TestCase,
  appUrl: string
): BugReport {
  const idx = test.failedStepIndex ?? 0;
  const upToFailed = test.steps.slice(0, idx + 1);
  const error = test.lastError ?? "";
  return {
    id,
    title: `${test.title} — failed at step ${idx + 1}`,
    severity: deriveSeverity(test, error),
    impact: deriveImpact(test, error),
    reproSteps: upToFailed.map(formatStep),
    expected: test.expected || "Step should complete without error",
    actual: error || "no error message captured",
    url: appUrl,
    testId: test.id,
    reportedAt: new Date().toISOString(),
    source: "analysis",
    evidence: {
      error,
      logs: {
        attempts: test.attempts,
        failedStepIndex: idx,
        failedStep: test.steps[idx],
        priorSteps: test.steps.slice(0, idx).map(formatStep),
      },
    },
  };
}

function formatStep(s: TestStep, i: number): string {
  const value = s.value !== undefined ? ` value="${s.value}"` : "";
  return `${i + 1}. ${s.action} ${s.target}${value}`;
}

function deriveSeverity(test: TestCase, error: string): Severity {
  if (/\bHTTP\s*5\d\d\b/i.test(error) || /5\d\d\s+(?:status|response)/i.test(error)) {
    return "critical";
  }
  if (test.type === "authentication") {
    return test.priority === "high" ? "critical" : "high";
  }
  if (test.priority === "high") return "high";
  if (test.priority === "low") return "low";
  return "medium";
}

function deriveImpact(test: TestCase, error: string): string {
  if (/\b5\d\d\b/.test(error)) {
    return "Server-side failure breaks the user flow; likely affects all users hitting this path.";
  }
  switch (test.type) {
    case "authentication":
      return "Authentication flow broken — users may be unable to log in or stay signed in.";
    case "crud":
      return "Data operation broken — users cannot create, read, update or delete the affected entity.";
    case "form_validation":
      return "Form validation broken — invalid data may reach backend or valid data may be rejected.";
    case "navigation":
      return "Navigation broken — users cannot reach this part of the application.";
    case "error_handling":
      return "Error path broken — failures are not surfaced or recovered correctly.";
    case "smoke":
      return "Critical baseline path broken — affects most users.";
    case "regression":
      return "Previously-working behavior has regressed.";
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Test correction — generate a refined version of the failing test that the
// agent (or a human) can run next. We never auto-execute corrections here;
// they're written into the report so they can be run on the next pass.
// ──────────────────────────────────────────────────────────────────────────────

function generateCorrection(test: TestCase, issue: TestIssue): CorrectedTest | null {
  const idx = issue.failedStepIndex;
  const before = test.steps.slice(0, idx);
  const failed = test.steps[idx];
  const after = test.steps.slice(idx + 1);

  let prereq: TestStep[] = [];
  let rationale = "";

  switch (issue.category) {
    case "disabled_element":
      // Inspect the page first; the agent should then add the actual prereq
      // (fill required fields, accept terms, etc.) once it sees the structure.
      prereq = [
        {
          action: "extract",
          target: "page",
          expected:
            "Identify what enables the disabled control (required fields, prior step, gate).",
        },
      ];
      rationale = `${failed.target} was disabled. Inspect the page, then add the prereq step (e.g. fill required field) before re-attempting "${failed.action}".`;
      break;

    case "hidden_element":
      prereq = [
        {
          action: "extract",
          target: "page",
          expected: "Find the trigger that reveals the hidden element (tab, menu, modal).",
        },
      ];
      rationale = `${failed.target} is in the DOM but hidden. Add the UI activation step (open tab/menu/modal) before "${failed.action}".`;
      break;

    case "element_not_visible":
      prereq = [
        {
          action: "extract",
          target: "page",
          expected: "Verify the selector still matches and find the visibility prereq.",
        },
      ];
      rationale = `${failed.target} never became visible within the timeout. Verify the selector and add the prereq UI state change before "${failed.action}".`;
      break;
  }

  if (prereq.length === 0) return null;

  const corrected: TestCase = {
    id: `${test.id}_FIX`,
    title: `[FIX] ${test.title}`,
    type: test.type,
    priority: test.priority,
    expected: test.expected,
    steps: [...before, ...prereq, failed, ...after],
    status: "queued",
    attempts: 0,
  };

  return {
    originalId: test.id,
    originalTitle: test.title,
    rationale,
    corrected,
  };
}
