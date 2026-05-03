# QA Agent — Frontend

Production-quality React UI for the [AI QA Engineer](../README.md). Modern AI-agent-style dashboard: sidebar with run history, top bar with status, tabbed main area (Execution / Test Cases / Bugs), and a sticky URL input at the bottom.

> Currently runs against **mock data** only. The Zustand store is shaped to match the backend's SSE event contract, so swapping mock data for a live `EventSource` is a small change.

## Stack

- **Vite** + **React 18** + **TypeScript** (strict)
- **TailwindCSS** v3 with a custom dark theme
- **shadcn/ui-style** primitives (no Radix dependency — kept the API, rolled our own with React context)
- **Zustand** for state
- **lucide-react** for icons
- `class-variance-authority` + `clsx` + `tailwind-merge` for the variant + `cn()` pattern

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (HMR)
# or
npm run build
npm run preview      # http://localhost:4500
```

## Layout

```
src/
  App.tsx                       # 3-pane layout + tab routing
  main.tsx
  index.css                     # tailwind base + scrollbars + boot animation
  store/useStore.ts             # Zustand: status, currentRun, runsHistory, steps, testCases, bugs
  lib/
    utils.ts                    # cn(), formatTime(), relativeTime()
    mockData.ts                 # 4 runs, 10 steps, 8 tests, 3 bugs
  components/
    Sidebar.tsx                 # 260px — brand, New Run, run list with status dots
    TopBar.tsx                  # current URL, status pill, Start/Stop
    ExecutionFeed.tsx           # vertical step rail, color-coded action chips
    TestTable.tsx               # sortable look, status + priority badges
    BugList.tsx                 # cards with severity badge + expected/actual + repro
    RunInput.tsx                # sticky bottom URL input + Run QA
    ui/
      button.tsx                # CVA: default / secondary / ghost / outline / destructive / icon
      badge.tsx                 # success / warning / danger / critical / info / muted
      card.tsx
      input.tsx
      tabs.tsx                  # context-based, no extra deps
```

## Design choices

- **Dark theme by default** via `<html class="dark">`. No light-mode toggle (yet).
- **Radial vignette** on `body` so the app doesn't feel like a flat black sheet.
- **Animations**: every step row uses `animate-fade-in-up`; running statuses use a soft pulse; the boot uses a 320ms slide-up.
- **Auto-scroll** in the execution feed only kicks in when the user is already near the bottom — won't fight a manual scroll-up to read history.
- **Counts in tabs**: Bug count uses `danger` variant when non-zero so it visually pops.
- **Path alias `@/*`** → `src/*`, matching the shadcn/ui convention.

## Wiring to the backend (todo)

Replace the mock arrays in `src/lib/mockData.ts` with a live SSE subscription:

```ts
const es = new EventSource(`${API_BASE}/api/runs/${runId}/stream`);
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // route by event.type into the same store actions used by mock data
};
```

The store actions (`startRun`, `stopRun`, `pushStep`, …) are designed so the only change needed is the data source.
