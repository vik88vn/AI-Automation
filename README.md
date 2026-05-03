# AI QA Engineer

> Autonomous AI QA engineer. A tool-using deep agent (Anthropic / OpenAI / Ollama) explores live web apps with Playwright, generates and runs test cases, and classifies failures into real bugs vs. flaky tests.

Point it at a URL — the agent figures out the rest. It navigates, clicks, types, and extracts page structure on its own; generates test cases as it discovers features; runs them with retries; and ships a structured report that separates real bugs from broken tests.

---

## Highlights

- **Deep agent loop, not a fixed pipeline.** Every iteration: observe → update internal model → decide next action → execute via tool → analyze result. The agent adapts to what it finds; it doesn't follow a hard-coded crawl-then-test script.
- **Multi-provider LLM.** Ollama is the default (no API key, runs locally). Drop in an Anthropic or OpenAI key in the dashboard and it switches automatically.
- **Real Playwright execution.** Five browser tools the LLM calls directly: `navigate`, `click`, `type`, `extract`, `screenshot`. Plus higher-level tools for recording observations, adding tests, running them, and reporting bugs.
- **Post-test analysis layer.** Deterministic classifier separates real bugs from test-side failures (disabled element, hidden element, timeout-waiting). Generates corrected test suggestions with the missing prereq step.
- **Live dashboard.** Built-in HTML dashboard streams every tool call, model update, test result, and bug via SSE.
- **Production-quality React frontend.** Vite + React + TypeScript + Tailwind + Zustand. Sidebar, top bar, tabbed main area (Execution / Test Cases / Bugs), and a sticky URL input — currently runs against mock data, ready to wire to the SSE backend.
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
ollama pull llama3.1
npm run agent -- http://localhost:3000 --max-steps=40

# Or with Anthropic
ANTHROPIC_API_KEY=sk-ant-... npm run agent -- https://example.com

# Or with OpenAI
OPENAI_API_KEY=sk-... npm run agent -- --provider=openai https://example.com
```

### Or use the live dashboard

```bash
npm run agent:serve
# → http://localhost:4310
```

Open it, click the gear icon, drop in your API key (or leave blank for Ollama), enter a target URL (localhost works), click **Start**. Live SSE feed of every step, model update, and bug.

### Or use the React frontend (mock-data prototype)

```bash
cd frontend
npm install
npm run build
npm run preview        # → http://localhost:4500
```

---

## Architecture

```
src/
  agent/                       # Deep agent (recommended)
    agent.ts                   # Tool-use loop, retry/stop logic
    browser.ts                 # Playwright wrapper exposing 5 browser actions
    state.ts                   # Internal AppModel + tests + bugs state
    llm.ts                     # Anthropic / OpenAI / Ollama abstraction
    types.ts
    cli.ts                     # `npm run agent`
    serve.ts                   # `npm run agent:serve`
    server.ts                  # HTTP + SSE backend for the dashboard
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
    components/                # Sidebar, TopBar, ExecutionFeed, TestTable, BugList, RunInput
    components/ui/             # Shadcn-style primitives (button, badge, card, input, tabs)
    lib/                       # cn(), mockData

.github/workflows/qa.yml       # Scheduled QA runs (configurable: pipeline or agent)
```

### Deep agent loop

```
┌──────────────────────────────────────────────────────────┐
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
   → generate corrected test suggestions
             ▼
        write report (JSON + Markdown)
```

### Tools the agent calls

| Tool                 | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `browser_action`     | navigate / click / type / extract / screenshot via Playwright |
| `record_observation` | Update AppModel: routes, auth, entities, flows, forms         |
| `add_test`           | Append a structured test case to the queue                    |
| `run_test`           | Execute a queued test, returns per-step results               |
| `report_bug`         | File a bug with severity + repro                              |
| `finish`             | End the run with a summary                                    |

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
| `--model`        | provider default         | `claude-opus-4-7`, `gpt-4o`, `llama3.1`, …              |
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

### Provider auto-resolution

Order: Anthropic key → OpenAI key → Ollama. Explicit selection in dashboard settings or `--provider` overrides auto. Bad model IDs are caught with a friendly error suggesting valid alternatives instead of raw 404 JSON.

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
  "bugs":  [...],
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
- **medium** — form validation, generic medium-priority failure
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

---

## CI integration

`.github/workflows/qa.yml` runs the QA suite on a schedule (every 6h) and on manual dispatch. Switchable between deep agent and classic pipeline via the workflow input. Reports are uploaded as artifacts on every run.

Required secrets:
- `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, or rely on a self-hosted Ollama)
- `QA_TARGET_URL`

---

## Design notes

- **Why the deep agent loop.** Fixed pipelines miss what they weren't told to look for. The loop lets the agent follow links it discovers, generate tests for forms it finds mid-run, and refine failing tests instead of just logging them.
- **Why prompt caching (Anthropic).** The system prompt is stable across iterations; `cache_control: { type: "ephemeral" }` keeps cost low on long runs.
- **Why Ollama as default.** Zero-key local runs make the dashboard usable for anyone without an API account. The provider abstraction handles all three with the same tool-call protocol.
- **Why a deterministic post-test analyzer.** The agent's own `report_bug` calls are subjective. The analyzer is rule-based and runs over every failed test at end-of-run, so `bugs=0 even when tests fail` can't happen silently.
- **Why bounded retries (max 2).** Catches transient flake (network blips, slow renders) without masking real failures. Retries are "intelligent" — the agent gets failure context and can rewrite the test or pivot.
- **No fabricated selectors.** Selectors come from `extract` results (id, name, aria-label, data-testid, first class). Invented selectors were the #1 source of false failures in early versions.

---

## Limitations

- Login-gated apps need a manual auth flow first; the explorer crawls anonymously.
- Highly dynamic SPAs may need `--max-steps` raised and timeouts tuned.
- The frontend (React app) is currently mock-data only — backend wiring is the next milestone.
- Ollama tool-calling quality varies by model. `llama3.1`, `qwen2.5`, and `qwen2.5-coder` are good defaults.

---

## License

MIT — see [LICENSE](./LICENSE).
