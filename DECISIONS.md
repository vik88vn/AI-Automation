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