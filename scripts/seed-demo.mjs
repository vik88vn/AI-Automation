import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("reports");
fs.mkdirSync(ROOT, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const url = "https://example.com";

const exploration = {
  startUrl: url,
  routes: [
    { url: `${url}/`, title: "Example Domain", depth: 0, status: 200 },
    { url: `${url}/login`, title: "Login", depth: 1, status: 200 },
    { url: `${url}/signup`, title: "Sign Up", depth: 1, status: 200 },
    { url: `${url}/dashboard`, title: "Dashboard", depth: 1, status: 200 },
    { url: `${url}/items`, title: "Items", depth: 2, status: 200 },
  ],
  flows: [
    { name: "Login flow", description: "Submit credentials and verify redirect.", startUrl: `${url}/login` },
    { name: "Signup flow", description: "Complete registration and verify creation.", startUrl: `${url}/signup` },
  ],
  forms: [
    {
      url: `${url}/login`,
      selector: "form >> nth=0",
      action: "/api/login",
      method: "POST",
      submitSelector: 'form >> nth=0 >> button[type="submit"]',
      inputs: [
        { name: "email", type: "email", selector: 'form >> nth=0 >> [name="email"]', required: true, placeholder: "you@example.com", label: "Email" },
        { name: "password", type: "password", selector: 'form >> nth=0 >> [name="password"]', required: true, placeholder: "", label: "Password" },
      ],
    },
  ],
  features: ["authentication", "crud", "data_listing", "forms"],
};

const testCases = [
  { id: "TC_001", title: "Homepage loads and renders main heading", type: "smoke", priority: "high", expected: "Homepage returns 200 and shows the page heading.",
    steps: [
      { action: "navigate", description: "Open homepage", url: `${url}/` },
      { action: "assert_visible", description: "Verify heading visible", selector: "h1" },
    ]},
  { id: "TC_002", title: "Login page form is reachable", type: "navigation", priority: "high", expected: "Login form is rendered.",
    steps: [
      { action: "navigate", description: "Open login page", url: `${url}/login` },
      { action: "assert_visible", description: "Email input visible", selector: 'input[name="email"]' },
      { action: "assert_visible", description: "Password input visible", selector: 'input[name="password"]' },
    ]},
  { id: "TC_003", title: "Login with valid credentials redirects to dashboard", type: "authentication", priority: "high", expected: "After valid login, user lands on /dashboard.",
    steps: [
      { action: "navigate", description: "Open login", url: `${url}/login` },
      { action: "fill", description: "Enter email", selector: 'input[name="email"]', value: "demo@example.com" },
      { action: "fill", description: "Enter password", selector: 'input[name="password"]', value: "demo-password" },
      { action: "click", description: "Submit", selector: 'button[type="submit"]' },
      { action: "wait_for_url", description: "Wait for dashboard", url: "**/dashboard**" },
    ]},
  { id: "TC_004", title: "Login with invalid email is rejected", type: "form_validation", priority: "medium", expected: "Validation error message is shown.",
    steps: [
      { action: "navigate", description: "Open login", url: `${url}/login` },
      { action: "fill", description: "Enter invalid email", selector: 'input[name="email"]', value: "not-an-email" },
      { action: "fill", description: "Enter password", selector: 'input[name="password"]', value: "x" },
      { action: "click", description: "Submit", selector: 'button[type="submit"]' },
      { action: "assert_visible", description: "Error message visible", selector: ".error" },
    ]},
  { id: "TC_005", title: "Empty login submission shows required errors", type: "form_validation", priority: "medium", expected: "Required-field errors appear for both inputs.",
    steps: [
      { action: "navigate", description: "Open login", url: `${url}/login` },
      { action: "click", description: "Submit empty form", selector: 'button[type="submit"]' },
      { action: "assert_visible", description: "Required error visible", selector: ".error" },
    ]},
  { id: "TC_006", title: "Signup page is reachable", type: "navigation", priority: "medium", expected: "Signup form renders.",
    steps: [
      { action: "navigate", description: "Open signup", url: `${url}/signup` },
      { action: "assert_visible", description: "Signup form visible", selector: "form" },
    ]},
  { id: "TC_007", title: "Dashboard requires authentication", type: "authentication", priority: "high", expected: "Anonymous request redirects to /login.",
    steps: [
      { action: "navigate", description: "Open dashboard anonymously", url: `${url}/dashboard` },
      { action: "wait_for_url", description: "Redirected to login", url: "**/login**" },
    ]},
  { id: "TC_008", title: "Items page lists existing items", type: "crud", priority: "high", expected: "Item list is rendered.",
    steps: [
      { action: "navigate", description: "Open items page", url: `${url}/items` },
      { action: "assert_visible", description: "Item list visible", selector: "table, ul" },
    ]},
  { id: "TC_009", title: "Create item flow", type: "crud", priority: "high", expected: "New item appears in list.",
    steps: [
      { action: "navigate", description: "Open items", url: `${url}/items` },
      { action: "click", description: "Click new item", selector: "text=New" },
      { action: "fill", description: "Enter name", selector: 'input[name="name"]', value: "QA item" },
      { action: "click", description: "Save", selector: 'button[type="submit"]' },
      { action: "assert_text", description: "Item visible in list", selector: "table", expected: "QA item" },
    ]},
  { id: "TC_010", title: "404 for non-existent route", type: "error_handling", priority: "medium", expected: "Server returns 404 for unknown route.",
    steps: [
      { action: "navigate", description: "Open unknown route", url: `${url}/this-does-not-exist` },
      { action: "assert_status", description: "HTTP 404", expected: "404" },
    ]},
  { id: "TC_011", title: "Navigation links route correctly", type: "navigation", priority: "medium", expected: "Footer link navigates to /about.",
    steps: [
      { action: "navigate", description: "Open homepage", url: `${url}/` },
      { action: "click", description: "Click About link", selector: "text=About" },
      { action: "assert_url", description: "URL is /about", expected: "/about" },
    ]},
  { id: "TC_012", title: "Logout returns to login page", type: "authentication", priority: "medium", expected: "After logout, user is on /login.",
    steps: [
      { action: "navigate", description: "Open dashboard (assume authed)", url: `${url}/dashboard` },
      { action: "click", description: "Click logout", selector: "text=Logout" },
      { action: "wait_for_url", description: "On /login", url: "**/login**" },
    ]},
];

const failedIds = new Set(["TC_004", "TC_009"]);
const results = testCases.map((tc) => {
  const failed = failedIds.has(tc.id);
  return {
    id: tc.id,
    title: tc.title,
    type: tc.type,
    priority: tc.priority,
    status: failed ? "FAIL" : "PASS",
    logs: failed
      ? [
          `[${new Date().toISOString()}] Starting ${tc.id} (attempt 1)`,
          `[${new Date().toISOString()}] Step 4/5: click - Submit`,
          `[${new Date().toISOString()}] FAILED: locator.click: Timeout 10000ms exceeded waiting for element to be visible`,
        ]
      : [
          `[${new Date().toISOString()}] Starting ${tc.id} (attempt 1)`,
          `[${new Date().toISOString()}] Completed ${tc.id} successfully`,
        ],
    error: failed ? "locator.click: Timeout 10000ms exceeded — '.error' was not visible" : "",
    durationMs: failed ? 11800 : 1200 + Math.floor(Math.random() * 800),
    attempts: failed ? 3 : 1,
    screenshot: failed ? `./reports/screenshots/${tc.id}_demo.png` : undefined,
    failedStepIndex: failed ? 3 : undefined,
  };
});

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.length - passed;

const bugs = results.filter((r) => r.status === "FAIL").map((r) => {
  const tc = testCases.find((t) => t.id === r.id);
  let severity = "medium";
  if (tc.type === "crud") severity = "high";
  if (tc.type === "form_validation") severity = "medium";
  return {
    title: `${r.id}: ${r.title}`,
    severity,
    impact:
      tc.type === "crud"
        ? "Core data operations (create/read/update/delete) may be unreliable."
        : "Forms may accept invalid input or reject valid input.",
    steps_to_reproduce: tc.steps.map((s, i) => `${i + 1}. ${s.action}${s.selector || s.url ? ` -> ${s.selector || s.url}` : ""} (${s.description})`),
    expected: tc.expected,
    actual: r.error,
    evidence: {
      screenshot: r.screenshot,
      logs: r.logs.slice(-5),
      error: r.error,
      url: tc.steps[0]?.url,
    },
  };
});

const report = {
  url,
  timestamp: new Date().toISOString(),
  durationMs: 47_320,
  summary: {
    total: results.length,
    passed,
    failed,
    passRate: Number((passed / results.length).toFixed(4)),
  },
  exploration,
  testCases,
  results,
  bugs,
};

const jsonPath = path.join(ROOT, `qa-report-${stamp}.json`);
const mdPath = path.join(ROOT, `qa-report-${stamp}.md`);

const md = renderMarkdown(report);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
fs.writeFileSync(mdPath, md, "utf8");

console.log(`Demo report written:`);
console.log(`  ${jsonPath}`);
console.log(`  ${mdPath}`);

function renderMarkdown(r) {
  const lines = [];
  lines.push(`# QA Report — ${r.url} (DEMO)`);
  lines.push("");
  lines.push(`**Run:** ${r.timestamp}`);
  lines.push(`**Duration:** ${(r.durationMs / 1000).toFixed(1)}s`);
  lines.push(`**Result:** ${r.summary.failed === 0 ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("> This is a synthetic demo report so the viewer has something to show.");
  lines.push("> Run `npm run qa -- <url>` with `ANTHROPIC_API_KEY` set for a real scan.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total tests: ${r.summary.total}`);
  lines.push(`- Passed: ${r.summary.passed}`);
  lines.push(`- Failed: ${r.summary.failed}`);
  lines.push(`- Pass rate: ${(r.summary.passRate * 100).toFixed(1)}%`);
  lines.push("");
  lines.push("## Exploration");
  lines.push("");
  lines.push(`- Routes discovered: ${r.exploration.routes.length}`);
  lines.push(`- Forms discovered: ${r.exploration.forms.length}`);
  lines.push(`- Detected features: ${r.exploration.features.join(", ")}`);
  lines.push("");
  lines.push("## Test Results");
  lines.push("");
  lines.push("| ID | Title | Type | Priority | Status | Duration | Attempts |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const t of r.results) {
    lines.push(`| ${t.id} | ${t.title} | ${t.type} | ${t.priority} | ${t.status} | ${(t.durationMs/1000).toFixed(1)}s | ${t.attempts} |`);
  }
  lines.push("");
  if (r.bugs.length === 0) {
    lines.push("## Bugs");
    lines.push("");
    lines.push("No bugs detected.");
    return lines.join("\n");
  }
  lines.push("## Bugs");
  lines.push("");
  const grouped = { critical: [], high: [], medium: [], low: [] };
  for (const b of r.bugs) grouped[b.severity].push(b);
  for (const sev of ["critical", "high", "medium", "low"]) {
    if (grouped[sev].length === 0) continue;
    lines.push(`### ${sev[0].toUpperCase() + sev.slice(1)} (${grouped[sev].length})`);
    lines.push("");
    for (const b of grouped[sev]) {
      lines.push(`#### ${b.title}`);
      lines.push("");
      lines.push(`**Severity:** ${b.severity}`);
      lines.push(`**Impact:** ${b.impact}`);
      lines.push("");
      lines.push("**Steps to reproduce:**");
      for (const s of b.steps_to_reproduce) lines.push(`  - ${s}`);
      lines.push("");
      lines.push(`**Expected:** ${b.expected}`);
      lines.push("");
      lines.push("**Actual:**");
      lines.push("");
      lines.push("```");
      lines.push(b.actual);
      lines.push("```");
      lines.push("");
      if (b.evidence.logs?.length) {
        lines.push("**Recent logs:**");
        lines.push("");
        lines.push("```");
        for (const l of b.evidence.logs) lines.push(l);
        lines.push("```");
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}
