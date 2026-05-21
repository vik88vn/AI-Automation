# Technical Decision Log: Autonomous AI QA Engineer

This document serves as a record of the architectural choices, engineering trade-offs, and design philosophy implemented during the development of the AI QA Engineer.

## 1. State Persistence & Session Hydration
**Decision:** Integrated `persist` middleware into the Zustand `DisplayStore`.
**Reasoning:** Testing runs for complex web applications are long-running processes. By persisting the store to `localStorage`, I ensured that the "AppModel" (the agent's internal map of the site) and the "Bug List" survive browser refreshes. This moves the tool from a "one-off script" to a persistent professional workspace.

## 2. Visual Identity: "The Tester That Never Sleeps"
**Decision:** Designed a custom `Home.tsx` landing page with a Dark-Mode aesthetic (`bg-slate-950`) and glowing UI accents.
**Reasoning:** To position this as a premium "Autonomous" tool, the UI needs to feel powerful yet focused. The dark theme reduces eye strain for engineers monitoring logs, while the gradient typography establishes a modern, AI-first brand identity.

## 3. UX: Perceptual Performance (Terminal Logs)
**Decision:** Implemented a sequential "Terminal Log" micro-interaction during the agent launch sequence.
**Reasoning:** Instead of a generic loading spinner, the tool cycles through system initialization logs (e.g., "Initializing Playwright..."). This provides immediate feedback to the user and reinforces the narrative of a deep, agentic process happening behind the scenes.

## 4. Multi-Session Architecture
**Decision:** Implemented a `useSessionStore` to manage an array of historical runs.
**Reasoning:** Users need to compare results across different versions of their site. By decoupling the "Active Run" from the "Run History," I enabled a tabbed navigation system that allows for rapid switching between different testing sessions without losing state.

## 5. Authentication Strategy: Human-in-the-Loop (Planned)
**Decision:** Adopted a "Credential Injection" model over "Autonomous Guessing" for login walls.
**Reasoning:** Autonomous agents often fail at MFA (Multi-Factor Authentication). By designing a `request_credentials` tool, I am prioritizing reliability. The agent detects the login requirement, pauses for secure human input, and then persists the resulting session cookies to avoid redundant login prompts.

5/3/2026 3:02 pm
Implemented a 'Human-in-the-Loop' authentication bridge. Chose to pause agent execution for manual credential injection rather than autonomous guessing to ensure 100% reliability on MFA-protected and enterprise-grade login walls.

5/3/2026 2:48 pm
UX Optimization: Refactored the API configuration flow to be 'Pre-Flight' rather than 'Reactive.' Implemented a persistent Settings layer to allow users to configure LLM providers before the first run, eliminating the 'Fail-then-Fix' loop. Also implemented constrained-scroll containers for test results to maintain UI integrity on high-density data runs.

5/3/2026 3:20 pm
Implemented constrained-viewport scrolling using CSS calc() to maintain UI integrity during high-volume test execution. Also created an onClick handler for the logo and text on the top left of the UI to send the user back to the home page once clicked.

## 6. Folder Merge & Conflict Resolution
**Decision:** When parallel Claude session work appeared in a duplicate subfolder, resolved via git merge instead of manual copying.
**Reasoning:** Preserves history, enables tracking of parallel work, and ensures all features are integrated correctly. Typed out manual merge conflict resolution for frontend stores and components, combining parent's session persistence with sub's event-driven architecture.

## 7. Mock Data Lifecycle
**Decision:** Changed `MOCK_ACTIVE_RUN` from a pre-populated running session to an empty queued state.
**Reasoning:** Users were confused seeing a test "in progress" on fresh load. An empty initial state clearly signals "waiting for user input" and respects the principle that the app should start in a default/clean state rather than assume test history exists.

## 8. URL Input & Localhost Support
**Decision:** Changed input type from "text" to "url" with client-side URL normalization logic.
**Reasoning:** 
- HTML5 `type="url"` provides built-in validation and mobile keyboards optimized for URLs
- Added regex-based protocol injection: `localhost:3000` → `http://localhost:3000`, domain without protocol → `https://domain`
- This lowers the barrier to testing local dev servers while maintaining HTTPS-first for production domains
- Validation happens in `onSubmit` before calling `startNewRun`, preventing malformed URLs from reaching the backend

## 9. Architecture Decision: Client vs. Server URL Normalization
**Decision:** Handle URL normalization on the frontend, not the backend.
**Reasoning:** 
- Frontend can provide immediate visual feedback (invalid URL styling, helper text)
- Reduces backend complexity and API contract brittleness
- Works offline and enables form validation before sending requests
- UX: user sees their input transformed in real-time, building confidence

## 10. Performance Metrics Capture (Implemented)
**Decision:** Capture browser navigation timing, paint entries (FCP), and component-level breakdowns (wait/action/post-action) on every navigate action; surface as a `PerformanceMetricsBadge` in the Execution Feed.
**Reasoning:**
- A single `durationMs` per step is too coarse to spot regressions — splitting time into wait, action, and post-action phases reveals where slowdowns originate.
- Capturing `performance.timing` and `performance.getEntriesByType("paint")` from inside `page.evaluate()` is virtually free (no extra network round-trips, no extra dependencies).
- Streaming metrics piggybacks on the existing `tool_result` event so the dashboard sees performance data live without an extra event channel; a dedicated `perf_metrics` event type is reserved for cases where metrics arrive asynchronously.
- The Core Web Vitals (FCP, LCP, TTI) are surfaced as proper metric badges so users see the same numbers product engineers care about — not just internal step durations.

## 11. Root Cause Analysis: Failure Context Capture (User-Implemented Backend)
**Decision:** Extend the agent's error path to capture a structured `FailureContext` (errorType, stackTrace, failurePhase, selectorValid, pageState) on every failed `BrowserToolResult`, propagate it onto the failed `TestCase`, then attach it as `evidence` on any `BugReport` filed against that test.
**Reasoning:**
- The previous failure model was a single 500-character `lastError` string — useful for a glance, useless for debugging. Capturing the error type, full stack trace, and the page state at failure time turns a "test failed" into "selector `button[type='submit']` was found but the click event never fired a navigation; here's the console output."
- Validating the selector at failure time (does the element still exist? is it visible?) lets the post-test analysis distinguish a stale selector from a real product bug — the dashboard can show a green/red selector-status pill instead of forcing the user to read the stack trace.
- Storing the evidence on the bug itself (not just the test) means an exported bug report is self-contained: a developer reading the JSON can reproduce the failure without needing the test's full transcript.

## 12. Bug Evidence Schema & Frontend Plumbing
**Decision:** Mirrored the backend `BugEvidence` and `FailureContext` shapes onto frontend `BackendBug` / `BackendTest` / `Bug` / `TestCase` interfaces, then wired `eventRouter.toFrontendBug` and `toFrontendTest` to translate the wire format into the dashboard's domain model.
**Reasoning:**
- Keeping the wire shape (`BackendBug`) explicitly separate from the dashboard's view model (`Bug`) preserves the eventRouter as the single translation seam — UI components never see the raw agent payload, and breaking changes in the backend can't ripple into 30 components at once.
- The frontend `Bug.evidence` is fully optional: existing snapshots without evidence still render, and components can degrade gracefully (just hide the Root Cause panel) when the field is absent.
- Mock bugs in `mockData.ts` were enhanced with realistic `evidence` (real stack traces, selector analyses, console logs) so the dashboard renders meaningfully without a live backend run — critical for designing the failure-detail UI without burning agent cycles.

## 13. Resolving Run.startedAt Nullability
**Decision:** Changed `Run.startedAt` from `string` to `string | null` to match the queued/empty-active-run state introduced in decision #7.
**Reasoning:** The empty `MOCK_ACTIVE_RUN` carries `startedAt: null` (a queued run hasn't started yet). The interface had to follow reality, not the other way around. `RunHistorySidebar` now renders an em-dash placeholder when `startedAt` is null instead of crashing on a null `relativeTime()` call.

## 14. Eliminating Duplicate Method Implementations in browser.ts
**Decision:** Removed three placeholder methods (`validateSelector`, `buildFailureContext`, `actionToPhase`) that were duplicated lower in the file, keeping the integrated versions wired into the `execute()` error path.
**Reasoning:** The placeholder versions had a hardcoded `selectorValid: false` and an empty `title` — they would have silently masked real selector validity in the production path. Consolidating to a single working implementation eliminates the drift risk and makes the failure-context contract enforced at the type system level (one definition, one caller).

## 15. Deterministic Race Condition Detection via `wasDisabledAfterClick`
**Decision:** Extended the `click_immediate` browser action to evaluate the target element's `disabled` / `aria-disabled` state immediately after the click fires, surfaced as `wasDisabledAfterClick` in the result `data`. The agent's `handleRunTest` step loop then auto-files a medium-severity race condition bug (via `autoreportRaceCondition`) whenever a `click_immediate` step succeeds AND the element reports as disabled post-click.
**Reasoning:**
- The previous design relied on the LLM noticing a transient race window from a tool result and choosing to file a bug — an unreliable, prompt-dependent path. By moving the detection into Playwright + a deterministic agent-side check, we removed the LLM from the decision loop.
- The signal is precise: `wasDisabledAfterClick=true` after a force-click means JS *did* run and disable the element, so the click landed during a real race window. Buttons that are simply never disabled (a normal "submit") never produce this signal — false positives are structurally impossible.
- Catching the bug requires no new test scaffolding from the agent. Any existing `click_immediate` step doubles as a probe, so we get coverage for free as the agent explores commerce/cart/admin actions.
- The bug evidence carries the selector and final URL, so the developer reading the report can navigate to the page, inspect the element, and identify which JS handler is responsible for the late `disabled = true` assignment.

After testing the bugged local host again, bugs 2 and 7 wern't caught, to fix this i added 4 code blocks to src/agent/agen.ts. First the FormEntry to imports at line 17, then i had to hook the form seeder at line 710, then at line 600 i replaced the 591-601 code block with an updated block to hook the click_immediate seeder from extract results, lastly i added the 3 helper methods after line 1349.

on the 2nd run of the day bug 2 and 7(the 2 race conditions) meaning the agent marked them as low marginal value but the click immeditate probes were queed. To fix this i changed line 1504 and 555-564 of src/agent/agent.ts for medium to high priority on seeded click_immediate probes and reject if any high-priority tests are still qued

had the idea of adding playwright so the application would be able to fix bugs found and i also added a chat bot to assist the user in testing and fixing. both were built with the help of claude code opus 4.7

first i had to create a src/agent/fixer.ts file with 668 lines to create a fix agent that reads source files uses llm to identify and patch bugs and to veriy fixes with playwright.Key exports:

FixAgent class — LLM loop with file system tools
readSourceFile(), writeSourceFile(), listDirectory(), searchFiles(), grepFiles() — file tools scoped to project root (path-traversal safe)
Key features:

5 LLM tools: read_file, write_file, list_dir, search_files, grep (searches file contents, critical for finding code)
analyze​AndPatch() — runs LLM agentic loop (max 20 steps, 8192 tokens) to analyze bug and write fixes
verify() — launches headless Playwright, navigates to bug URL, checks for HTTP 5xx, console errors, network errors
Console logging on every tool call so you can watch the fix agent work in the backend terminal
Handles SSE streaming of fix events to the frontend

next i created another file called frontend/src/components/ChatPanel.tsx 250 lines with the purpose of creating a collapsable chat bot at the bottom of the dash board meant for post execution
Key features:

Expandable/collapsible header with "Agent Chat" title
Message history (user messages on right, agent on left with Bot icon)
Input field + Send button + "Fix All Bugs" button (Wrench icon)
Pause functionality: AbortController-based stop button to abort chat/fix in progress
Calls /api/chat with message + run context (bugs, tests) + provider settings from localStorage
Parses LLM responses for JSON actions block: {"actions": [{"type": "fix", "bugId": "BUG_001"}]}
Executes fixes: For each action, calls /api/fix SSE endpoint, reads events, displays per-bug status
Auto-scroll to latest message
Loading indicator (bouncing dots)
User interactions:

Chat about bugs found
Click "Fix All Bugs" → LLM decides which bugs to fix → agent patches files
Pause button stops the process
Chat shows progress ("Fixing BUG_001..." → "Fixed BUG_001! 2 file(s) patched.")

Modified Files
3. src/agent/server.ts (380+ lines)
New endpoints:

POST /api/chat
Accepts: message, runId, providerSettings, context (bugs + tests)
Calls LLM with seeded system prompt containing bug list
LLM responds with text + optional JSON actions block
Returns: { reply: string, actions?: Array<{ type, bugId }> }
POST /api/fix (SSE-streamed)
Accepts: full bug object, projectRoot, targetUrl, providerSettings
Spawns FixAgent
Streams SSE events: fix_start → fix_analyzing → fix_patching → fix_verifying → fix_done/fix_error
Frontend reads SSE stream and updates chat in real time
Other changes:

Imported FixAgent and createProvider for provider initialization
Added CORS preflight handler for /api/* routes
Both endpoints accept providerSettings from frontend (API keys from Settings dialog)
4. src/agent/agent.ts
Added:

High-priority finish guard (lines 555-564): Blocks finish tool if high-priority queued tests exist
Prevents agent from skipping deterministic bug-detection tests
Forces agent to run all seeded tests before completing
Why: Ensures the agent doesn't exit early and miss race condition probes.

5. src/agent/browser.ts
Added:

clearTransientErrors() method (line 96)
Clears networkErrors and consoleErrors arrays at test boundaries
Prevents stale errors from leaking between tests (was causing duplicate bug reports)
Modified:

Added network error listeners to networkErrors array during page operations
Capture network 5xx responses in real time
6. src/agent/types.ts
No major changes, but context: already exports BugReport, TestCase, BugEvidence types that the chat/fix features use.

7. frontend/src/components/SettingsDialog.tsx
Added:

New "Bug Fix Agent" section with projectRoot text input
FolderOpen icon from lucide-react
Helper text explaining what projectRoot is used for
Settings persist to localStorage under SETTINGS_KEY
Updated:

DEFAULT_SETTINGS to include projectRoot: ""
Import FolderOpen icon
8. frontend/src/lib/api.ts
Modified:

ProviderSettings interface: added projectRoot?: string field
9. frontend/src/pages/Dashboard.tsx
Modified:

Imported ChatPanel component
Added <ChatPanel /> above <RunInput /> in the layout
ChatPanel renders conditionally (only when run is completed/failed)
10. frontend/src/components/BugList.tsx
Added:

State: fixingBugs — tracks which bugs are "fixing" / "done" / "error"
Function: handleFix() — reads projectRoot from localStorage, calls /api/fix SSE, reads events, updates status badges
Per-bug buttons:
Normal: "Fix" button (Wrench icon)
Fixing: "Fixing..." badge with spinner
Done: "Fixed" green badge (CheckCircle2)
Error: "Retry" button (red)
External link icon kept on each bug card
Updated:

Imported Button, Square (for pause), Loader2 (spinner), CheckCircle2 icons
Added useState for tracking fix states
11. LICENSE (changed)
Replaced MIT license with proprietary "all rights reserved" license

After testing the bug website again and trying to implement the fix 5 out of 7 bugs so i edited fixer.ts to have a restart command, for server.ts i edited the fix body interface which now accepts restartCommand, then for api.ts the provider settings allows for restarting, then i edited teh frontend to show restart command in the settings, the in chatpanel.tsx so the chat bot allows for restarting, and lastly BugList.tsx where i replaced readProjectRoot() to readFixSettings()
## SaaS Platform Build (Weeks 1–6)

Transformed the local tool into a multi-tenant SaaS platform across six tracked phases. Key architectural decisions:

**Advanced detectors (Week 1).** Added accessibility, security, and SEO/performance detectors as page-level audits in `browser.ts` (DOM queries + response-header inspection), orchestrated by `runAdvancedDetectors()` in `agent.ts` with per-URL dedup so the same page audited by many tests files one bug each. Chose passive header checks + an active XSS-reflection probe over a heavyweight scanner to keep runs fast.

**Database & auth (Week 2).** Picked **Prisma 6** over 7 — Prisma 7 moved the connection URL out of the schema into `prisma.config.ts` + driver adapters, which is more moving parts than this needs. Pinned to 6.19. Auth is JWT HS256 (shared secret, simpler than RS256 keypairs for a single backend) with typed access/refresh tokens; bcrypt cost 12. The native `http` server has no Express, so auth is helper functions (`requireAuth`/`tryAuth`/`requireRole`) the route handlers call, not middleware.

**REST API (Week 3).** Each route group is a dispatcher returning `boolean` (handled/not) so `server.ts` falls through cleanly to 404. Tenant isolation returns **404 not 403** to avoid leaking project existence. `matchPath()` does zero-dependency path-param extraction.

**Dashboards & reporting (Week 4).** Built **zero-dependency inline-SVG charts** instead of recharts — avoids a flaky install and adds no bundle weight. Report export emits **HTML (print-to-PDF) instead of a binary PDF lib** to keep cloud deploys dependency-light. Run persistence (`persistRun.ts`) maps the agent's lowercase severities/types to Prisma enums with an `OTHER` fallback.

**Security hardening (Week 5).** Added in-memory (Redis-swappable) fixed-window rate limiting on auth endpoints, and CSV formula-injection defense (prefix `= + - @` cells with a quote). Confirmed-safe: Prisma parameterizes all queries, `publicUser()` strips the password hash, errors return generic 500s.

**CI/CD & ZIP upload (Week 6).** GitHub Actions for typecheck/test/build + Cloudflare Pages deploy. The fix agent accepts a **base64 ZIP** of source for SaaS use (no local `projectRoot`), with Zip-Slip and zip-bomb defenses, operating in a temp dir and returning the patched ZIP.

**Verification.** Backend `tsc` clean, frontend build clean, 24 unit tests, 21 live route checks. Full DB CRUD and Cloudflare deploy require external resources (Postgres, Cloudflare account) provisioned at deploy time per `CLOUDFLARE_DEPLOYMENT.md`.
