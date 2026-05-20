# AI QA Engineer

> Autonomous AI QA engineer. A tool-using deep agent (Anthropic / OpenAI / Ollama) explores live web apps with Playwright, generates and runs test cases, classifies failures into real bugs vs. flaky tests, **patches the source code to fix the bugs it finds**, and re-verifies with a headless browser — all from a single dashboard.

Point it at a URL — the agent figures out the rest. It navigates, clicks, types, and extracts page structure on its own; generates test cases as it discovers features; runs them with retries; classifies the failures; **opens the project source, edits the offending files, restarts the target app, and confirms the fix works**; and ships a structured report that separates real bugs from broken tests.

> **Building a SaaS product?** See [**CLOUDFLARE_DEPLOYMENT.md**](./CLOUDFLARE_DEPLOYMENT.md) for production deployment on Cloudflare Pages (frontend) + Railway/Render (backend).

---

## What's new (May 2026)

The QA agent is now a **two-stage system**: detect and fix.

- **Fix Agent (`src/agent/fixer.ts`, 954 lines).** A second LLM loop with five file-system tools (`read_file`, `write_file`, `list_dir`, `search_files`, `grep`) scoped to the project root with path-traversal safety. It analyzes a bug, patches the offending source file, restarts the target app, then re-verifies with headless Playwright (HTTP 5xx check, console errors, network errors).
- **Auto-restart.** After patching, the fix agent kills the process on the target port (`lsof -iTCP:<port>`), runs the configured restart command (or auto-detects `npm start` / `npm run dev` from `package.json`), and polls the URL for readiness — patches go live before verification, no manual restart needed. A "Skip restart" toggle covers hot-reload setups (nodemon, webpack-dev-server).
- **Chat Panel (`frontend/src/components/ChatPanel.tsx`, 395 lines).** Collapsible post-run chat at the bottom of the dashboard. Ask about bugs, request fixes ("fix all bugs", "fix BUG_002 only"), and watch live SSE progress per-bug — `Fixing BUG_001…` → `(BUG_001) restarting target app…` → `Fixed BUG_001! 2 file(s) patched.` Includes an `AbortController`-based Stop button so you can cancel a long fix mid-stream.
- **BugShop test app (`test-app/`).** Express + static HTML demo with **7 intentional bugs** across auth, error handling, race conditions, server validation, search injection, and performance. Used as the canonical case study target.
- **Deterministic bug detection.** Five categories (network errors, auth bypass, race conditions via `wasDisabledAfterClick`, performance degradation via FCP/TTI, frontend validation gaps) are auto-reported in code rather than relying on LLM judgement — bug recall no longer depends on the model's mood.
- **Proprietary license.** The project is now licensed under a custom proprietary license (all rights reserved); previously MIT.

---

## Highlights

- **Deep agent loop, not a fixed pipeline.** Every iteration: observe → update internal model → decide next action → execute via tool → analyze result. The agent adapts to what it finds; it doesn't follow a hard-coded crawl-then-test script.
- **Multi-provider LLM.** Ollama is the default (no API key, runs locally). Drop in an Anthropic or OpenAI key in the dashboard and it switches automatically.
- **Real Playwright execution.** Five browser tools the LLM calls directly: `navigate`, `click`, `type`, `extract`, `screenshot`. Plus higher-level tools for recording observations, adding tests, running them, and reporting bugs.
- **Post-test analysis layer.** Deterministic classifier separates real bugs from test-side failures (disabled element, hidden element, timeout-waiting). Generates corrected test suggestions with the missing prereq step.
- **Bug Fix Agent.** When a bug is filed, the user can trigger the fix agent to read the source code, patch the offending file, restart the app, and verify the fix lands — all from the dashboard chat panel.
- **Live dashboard + React frontend.** Built-in HTML dashboard streams every tool call, model update, test result, bug, and fix progress event via SSE. The Vite + React + TypeScript + Tailwind + Zustand frontend layers a richer UI on top with sidebar, tabbed main area (Execution / Test Cases / Bugs), sticky URL input, and the post-run chat panel.
- **Two execution modes.**
  - **Deep agent (recommended).** The adaptive loop above.
  - **Classic pipeline.** Original explore → plan → execute → report flow, kept for stability and CI.

---

## Quick start

Requires Node.js 18.17+.

```bash
git clone https://github.com/rjsx197047/AI-Automation-QA-Engineer.git
cd AI-Automation-QA-Engineer
npm install
npm run install-browsers
```

### Run the deep agent against a target

```bash
# Ollama (no key needed — install Ollama + pull a model first)
ollama pull llama3.2
npm run agent -- http://localhost:3000 --max-steps=40

# Or with Anthropic
ANTHROPIC_API_KEY=sk-ant-... npm run agent -- https://example.com

# Or with OpenAI
OPENAI_API_KEY=sk-... npm run agent -- --provider=openai https://example.com
```

### Or use the live dashboard (HTML)

```bash
npm run agent:serve
# → http://localhost:4310
```

Open it, click the gear icon, drop in your API key (or leave blank for Ollama), enter a target URL (localhost works), click **Start**. Live SSE feed of every step, model update, and bug.

### Or use the React frontend (full experience with chat + fix)

```bash
# In one terminal: backend
npm run agent:serve         # → http://localhost:4310

# In another terminal: frontend
cd frontend
npm install
npm run dev                 # → http://localhost:5173
```

Open http://localhost:5173:

1. Click the gear icon → set your provider (Ollama works out of the box)
2. **For the Bug Fix Agent**, also set:
   - **Project root** — absolute path to the source code being tested (e.g. `/Users/me/code/my-app`)
   - **Restart cmd** — leave empty to auto-detect `npm start` / `npm run dev`, or specify `node server.js`, etc.
   - **Skip restart** — check this if your dev server hot-reloads (nodemon, webpack-dev-server)
3. Enter the target URL, click Start
4. After the run, expand the Agent Chat at the bottom → click **Fix All Bugs** or ask in natural language
5. Watch the chat stream the fix progress and restart messages

### Try the BugShop case study

The repo ships with a deliberately buggy demo app for end-to-end testing.

```bash
# Terminal 1: target app with intentional bugs
cd test-app
npm install
npm start                   # → http://localhost:3100

# Terminal 2: backend
npm run agent:serve

# Terminal 3: frontend
cd frontend && npm run dev  # → http://localhost:5173
```

Point the agent at `http://localhost:3100` and let it discover the 7 planted bugs documented in [`test-app/BUGS.md`](./test-app/BUGS.md). Then trigger Fix All Bugs and watch the agent patch `test-app/server.js` and the HTML files.

---

## Architecture

```
src/
  agent/                       # Deep agent (recommended)
    agent.ts                   # Tool-use loop, retry/stop logic, deterministic detectors
    browser.ts                 # Playwright wrapper exposing 5 browser actions + clearTransientErrors
    state.ts                   # Internal AppModel + tests + bugs state
    llm.ts                     # Anthropic / OpenAI / Ollama abstraction
    fixer.ts                   # ★ Bug Fix Agent — reads/patches source, restarts app, verifies
    types.ts
    cli.ts                     # `npm run agent`
    serve.ts                   # `npm run agent:serve`
    server.ts                  # HTTP + SSE backend (/api/runs, /api/chat, /api/fix)
    dashboard.html             # Built-in live dashboard
    analysis/
      analyzeResults.ts        # Post-test failure classifier

  modules/                     # Classic pipeline (legacy, still supported)
    explorer.ts                # Bounded crawl
    planner.ts                 # Test plan generation
    executor.ts                # Playwright test runner
    reporter.ts                # JSON + Markdown report
  services/claude.ts
  orchestrator.ts              # `npm run qa`
  cli.ts
  index.ts                     # Programmatic API: runQa()
  utils/logger.ts

frontend/                      # React + TS + Tailwind + Zustand UI
  src/
    App.tsx
    store/useStore.ts
    store/useSessionStore.ts   # Multi-session run history
    components/
      Sidebar, TopBar, ExecutionFeed, TestTable, BugList, RunInput
      ChatPanel.tsx            # ★ Post-run chat + fix orchestration
      SettingsDialog.tsx       # Provider keys + project root + restart cmd
      PerformanceBreakdown.tsx # FCP/TTI badges per navigate step
      RunHistorySidebar.tsx
    components/ui/             # Shadcn-style primitives (button, badge, card, input, tabs)
    lib/
      api.ts                   # startRun, subscribeToRun, ProviderSettings type
      eventRouter.ts           # Backend wire format → frontend domain model
      agentEvents.ts           # SSE event union
      mockData.ts              # Fixture bugs/tests with realistic evidence
      cn()

test-app/                      # ★ BugShop — intentional-bug demo target
  server.js                    # Express server with 7 deliberate defects
  public/                      # login, signup, products, dashboard, admin pages
  BUGS.md                      # Inventory of planted bugs + why each one matters

DECISIONS.md                   # Architectural decision log (15+ entries)
LICENSE                        # Proprietary — all rights reserved

.github/workflows/qa.yml       # Scheduled QA runs (configurable: pipeline or agent)
```

### The two-stage agent loop

```
┌──────────────────────────────────────────────────────────┐
│  Stage 1: DETECT                                         │
│  1. observe page state                                   │
│  2. update internal AppModel                             │
│  3. choose next high-value action                        │
│  4. call tool (browser_action / record / add_test / …)   │
│  5. read result + adapt                                  │
└────────────┬─────────────────────────────────────────────┘
             │ repeat until coverage ok or max steps
             ▼
   post-test analysis layer
   → classify failures: real bug vs disabled / hidden / timeout
   → deterministic detectors fire (5xx, auth bypass, race, perf, validation)
             ▼
        write report (JSON + Markdown)
             ▼
┌──────────────────────────────────────────────────────────┐
│  Stage 2: FIX  (user-triggered, via chat or Fix button)  │
│  1. read bug evidence + repro steps                      │
│  2. grep / read source files (path-traversal safe)       │
│  3. write_file with patched contents                     │
│  4. kill process on target port + restart command        │
│  5. poll URL until ready                                 │
│  6. headless Playwright re-verify (5xx / console / net)  │
│  7. emit fix_done or fix_error                           │
└──────────────────────────────────────────────────────────┘
```

### Tools the QA agent calls (Stage 1)

| Tool                 | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `browser_action`     | navigate / click / type / extract / screenshot via Playwright |
| `record_observation` | Update AppModel: routes, auth, entities, flows, forms         |
| `add_test`           | Append a structured test case to the queue                    |
| `run_test`           | Execute a queued test, returns per-step results               |
| `report_bug`         | File a bug with severity + repro                              |
| `finish`             | End the run with a summary (blocked while high-priority tests queued) |

### Tools the fix agent calls (Stage 2)

| Tool             | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `read_file`      | Read a file from project root (path-traversal safe)           |
| `write_file`     | Write/overwrite a file with patched contents                  |
| `list_dir`       | List a directory's contents                                   |
| `search_files`   | Find files by name pattern                                    |
| `grep`           | Search file **contents** for a regex (critical for finding handlers) |

---

## Configuration

### CLI flags (`npm run agent`)

| Flag             | Default                  | Notes                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------- |
| `<url>`          | —                        | Required positional argument; localhost works           |
| `--max-steps=N`  | `40`                     | Hard ceiling on agent iterations                        |
| `--no-headless`  | headless                 | Show the browser window                                 |
| `--report-dir`   | `./reports`              | Where reports + screenshots are written                 |
| `--provider`     | `auto`                   | `anthropic` / `openai` / `ollama` / `auto`              |
| `--model`        | provider default         | `claude-opus-4-7`, `gpt-4o`, `llama3.2`, …              |
| `--ollama-url`   | `http://localhost:11434` | Ollama base URL                                         |

### Environment variables

| Variable             | Used by                                              |
| -------------------- | ---------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Anthropic provider                                   |
| `OPENAI_API_KEY`     | OpenAI provider                                      |
| `OLLAMA_BASE_URL`    | Ollama provider override                             |
| `OLLAMA_MODEL`       | Ollama provider model override                       |
| `QA_TARGET_URL`      | Default target for both pipeline and CI              |
| `AGENT_PORT`         | Dashboard server port (default `4310`)               |

Server-side env vars are honored as a fallback when the dashboard's settings are empty.

### Dashboard settings (localStorage, key `ai-qa-deep-agent.settings.v1`)

| Field                 | Used by                                            |
| --------------------- | -------------------------------------------------- |
| `preferred`           | Forces a provider (`auto`/`anthropic`/`openai`/`ollama`) |
| `anthropicKey/Model`  | Anthropic provider auth + model override           |
| `openaiKey/Model`     | OpenAI provider auth + model override              |
| `ollamaBaseUrl/Model` | Ollama provider URL + model override               |
| `projectRoot`         | **Required for Fix Agent** — absolute path to source code |
| `restartCommand`      | Optional override; auto-detects `npm start` / `npm run dev` |
| `skipRestart`         | Set true for hot-reload dev servers                |

### Provider auto-resolution

Order: Anthropic key → OpenAI key → Ollama. Explicit selection in dashboard settings or `--provider` overrides auto. Bad model IDs are caught with a friendly error suggesting valid alternatives instead of raw 404 JSON.

---

## API endpoints

The backend (`src/agent/server.ts`) exposes three HTTP endpoints. All use SSE for streaming where applicable.

| Endpoint                     | Method | Purpose                                              |
| ---------------------------- | ------ | ---------------------------------------------------- |
| `POST /api/runs`             | POST   | Start a new QA run                                   |
| `GET /api/runs/:id/stream`   | SSE    | Live event stream for a run (tool calls, tests, bugs) |
| `POST /api/chat`             | POST   | Post-run chat with the agent (returns `{ reply, actions? }`) |
| `POST /api/fix`              | SSE    | Trigger the fix agent for a bug (streams `fix_*` events) |

### SSE event types

**Run stream:** `tool_call`, `tool_result`, `model_update`, `test_added`, `test_started`, `test_passed`, `test_failed`, `bug_reported`, `perf_metrics`, `done`.

**Fix stream:** `fix_start`, `fix_analyzing`, `fix_patching`, `fix_restarting`, `fix_verifying`, `fix_done`, `fix_error`.

---

## Output

Each run writes to the report directory:

- `agent-report-<timestamp>.json` — full structured report
- `agent-report-<timestamp>.md` — human-readable
- `screenshots/` — failure screenshots

The JSON includes:

```jsonc
{
  "summary": { /* tests, passed, failed, realBugs, falseFailures, … */ },
  "appModel": {
    "routes":   [...],
    "auth":     {...},
    "entities": [...],
    "flows":    [...],
    "forms":    [...]
  },
  "tests": [...],
  "bugs":  [...],   // each bug carries `evidence: { errorType, stackTrace, selectorAnalysis, consoleOutput, networkErrors, ... }`
  "analysis": {
    "summary":        { "total": 8, "passed": 5, "failed": 3, "realBugs": 1, "falseFailures": 2 },
    "testIssues":     [...],   // failures classified as test problems, not bugs
    "correctedTests": [...]    // suggested rewrites with missing prereq steps
  }
}
```

### Bug severity classification

- **critical** — HTTP 5xx, server-side failure
- **high** — auth failure, high-priority CRUD or smoke failure
- **medium** — form validation, generic medium-priority failure, race condition
- **low** — cosmetic / smoke-only / low-priority

### Failure classification (analysis layer)

Failed tests are routed into one of:

| Category              | Treatment                                                         |
| --------------------- | ----------------------------------------------------------------- |
| `disabled_element`    | Test issue — agent attempted action on disabled element           |
| `hidden_element`      | Test issue — element needs UI state change (open tab, modal, …)   |
| `element_not_visible` | Test issue — element exists but never became visible (timeout)    |
| `real_bug`            | Bug filed with `evidence: { error, logs }` and severity heuristic |

For every test issue, a corrected test (`<id>_FIX`) is generated with the missing prereq step prepended.

### Deterministic detectors (Stage 1)

These run **regardless of LLM choices** so bug recall doesn't depend on prompt luck:

| Detector                        | Trigger                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `autoreportNetworkErrors`       | Any 5xx or failed network request observed during a step         |
| `autoreportAuthBypass`          | Successful navigation to a gated route without credentials       |
| `autoreportRaceCondition`       | `click_immediate` succeeded but `wasDisabledAfterClick=true`     |
| `autoreportPerformanceDegradation` | FCP > 2s or TTI > 5s on a navigate step                       |
| `autoreportFrontendValidationGap`  | Form submitted with empty required field, server returned 400/500 |

---

## CI integration

`.github/workflows/qa.yml` runs the QA suite on a schedule (every 6h) and on manual dispatch. Switchable between deep agent and classic pipeline via the workflow input. Reports are uploaded as artifacts on every run.

Required secrets:
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, or rely on a self-hosted Ollama)
- `QA_TARGET_URL`

---

## Design notes

- **Why the deep agent loop.** Fixed pipelines miss what they weren't told to look for. The loop lets the agent follow links it discovers, generate tests for forms it finds mid-run, and refine failing tests instead of just logging them.
- **Why a fix agent on top of a QA agent.** A bug report is half the work. The fix agent closes the loop: read the bug, locate the code, patch it, prove it. The user's role shifts from "triage 12 bug tickets" to "review 12 PR-quality patches with a green re-test."
- **Why auto-restart.** Patching a file on disk doesn't change a running Node process — the old code stays loaded in memory. Without restart, "the test passes after the fix" was a lie. The fix agent now kills the port owner and respawns the app, so verification reflects what's actually live.
- **Why deterministic detectors instead of "the LLM will notice."** The LLM noticed about 60% of seeded bugs. The deterministic detectors catch 100% of the categories they cover, every run. The LLM still finds the long tail (UX issues, surprising flows) that rules can't anticipate.
- **Why the BugShop test app.** Reproducible case study. Each of the 7 bugs targets a different agent capability (auth reasoning, error handling, race detection, server vs client validation, fuzz inputs, performance). New detectors get a known-answer fixture to regress against.
- **Why prompt caching (Anthropic).** The system prompt is stable across iterations; `cache_control: { type: "ephemeral" }` keeps cost low on long runs.
- **Why Ollama as default.** Zero-key local runs make the dashboard usable for anyone without an API account. The provider abstraction handles all three with the same tool-call protocol.
- **Why bounded retries (max 2).** Catches transient flake (network blips, slow renders) without masking real failures. Retries are "intelligent" — the agent gets failure context and can rewrite the test or pivot.
- **No fabricated selectors.** Selectors come from `extract` results (id, name, aria-label, data-testid, first class). Invented selectors were the #1 source of false failures in early versions.
- **Path-traversal safety in the fix agent.** Every file tool resolves the requested path against the project root and rejects anything that escapes (`../../etc/passwd`). The fix agent can't touch files outside what the user explicitly opted in.
- **Why the chat panel is post-run only.** Trying to chat during an active QA run creates conflicting tool-call streams. Gating it on `status === "completed" || "failed"` keeps the LLM context clean and the UI predictable.

See [`DECISIONS.md`](./DECISIONS.md) for the full chronological architectural log (15+ entries covering state persistence, multi-session architecture, performance metrics, evidence schema, race detection, the fix agent, and more).

---

## Limitations

- Login-gated apps need a manual auth flow first; the explorer crawls anonymously.
- Highly dynamic SPAs may need `--max-steps` raised and timeouts tuned.
- The fix agent requires the project source on the same machine — it does not pull from git or operate on remote codebases.
- Auto-restart kills the process listening on the target port. If multiple apps share that port (rare), the wrong one will be restarted — set `skipRestart` and use a hot-reload dev server in that case.
- Ollama tool-calling quality varies by model. `llama3.2`, `qwen2.5-coder`, and `deepseek-r1:8b` are good defaults.
- The fix agent's verification is shallow (5xx / console errors / network errors). It does **not** re-run the original failing test — that's the human's job before merging.

---

## License

MIT — see [LICENSE](./LICENSE).
