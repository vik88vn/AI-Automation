import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUp,
  Globe,
  Loader2,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/SettingsDialog";
import { AgentFlow } from "@/components/AgentFlow";
import { useSessionStore } from "@/store/useSessionStore";
import { useStore } from "@/store/useStore";
import { RunStatuses } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Home — landing page.
//
// Single responsibility: capture a target URL and hand off to the dashboard.
// All session state mutation happens through `useSessionStore.startNewRun`,
// which atomically (a) snapshots the previously-active run into history,
// (b) creates a new Run, (c) hydrates `useStore` with an empty shell, and
// (d) flips the view to Dashboard. There is no out-of-band navigation.
// ─────────────────────────────────────────────────────────────────────────────

export function Home() {
  const startNewRun = useSessionStore((s) => s.startNewRun);
  const goToDashboard = useSessionStore((s) => s.goToDashboard);
  const activeRunId = useSessionStore((s) => s.activeRunId);
  const runs = useSessionStore((s) => s.runs);
  const lastUrl = useStore((s) => s.url);
  const liveStatus = useStore((s) => s.status);
  const [url, setUrl] = useState(lastUrl ?? "");
  const [isStarting, setIsStarting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // True iff there is an agent run currently executing in the background —
  // the user may have navigated home while leaving a run going.
  const activeRunning =
    liveStatus === RunStatuses.Running &&
    runs.some((r) => r.id === activeRunId && r.status === RunStatuses.Running);
  const activeRun = runs.find((r) => r.id === activeRunId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    let urlToTest = url.trim();
    if (!urlToTest || isStarting) return;

    // Support localhost URLs without protocol
    if (urlToTest.startsWith("localhost:") || urlToTest.match(/^127\.0\.0\.1(:\d+)?$/)) {
      urlToTest = `http://${urlToTest}`;
    }

    // Ensure URL has a protocol (http or https)
    if (!urlToTest.match(/^https?:\/\//)) {
      urlToTest = `https://${urlToTest}`;
    }

    setIsStarting(true);
    try {
      await startNewRun(urlToTest);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="relative min-h-full flex flex-col items-center px-6 overflow-y-auto overflow-x-hidden flex-1">
      {/* Ambient backdrop — subtle gradient orbs that don't compete with content */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-[40%] left-1/3 h-[320px] w-[420px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-[10%] right-[10%] h-[280px] w-[380px] rounded-full bg-fuchsia-500/5 blur-3xl" />
      </div>

      {/* Settings gear — top-right corner. Same SettingsDialog the Dashboard
          uses; localStorage-backed, so a key set here carries straight into
          the next run. */}
      <Button
        type="button"
        variant="icon"
        size="icon"
        onClick={() => setSettingsOpen(true)}
        title="Settings (provider, API keys, model)"
        aria-label="Open settings"
        className="absolute top-4 right-4"
      >
        <SettingsIcon className="size-4" />
      </Button>

      {/* Hero — fills the viewport and stays centered; the flow diagram
          below scrolls into view. */}
      <div className="flex w-full flex-col items-center justify-center min-h-[88vh] py-16">
      {/* Brand mark */}
      <div className="flex items-center gap-2 mb-10 animate-fade-in-up">
        <div className="size-8 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 grid place-items-center shadow-lg shadow-blue-500/20">
          <Sparkles className="size-4 text-zinc-50" />
        </div>
        <span className="text-sm font-semibold text-zinc-300 tracking-wide">
          QA Agent
        </span>
      </div>

      {/* Active-run pill — surfaces an in-flight backend run so the user
          knows something's running even while they're on the landing page.
          Same Loader2 spinner used by the sidebar / TopBar / TestTable for
          consistency. */}
      {activeRunning && activeRun && (
        <button
          type="button"
          onClick={goToDashboard}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/15 transition-colors animate-fade-in-up"
          title="A run is in progress — click to view"
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span className="font-medium">Run in progress</span>
          <span className="text-amber-200/60 font-mono truncate max-w-[260px]">
            {activeRun.url.replace(/^https?:\/\//, "")}
          </span>
          <ArrowRight className="size-3" />
        </button>
      )}

      {/* Title + motto */}
      <h1 className="text-center text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-zinc-50 max-w-3xl leading-[1.05] animate-fade-in-up">
        Autonomous QA Engineer
      </h1>
      <p className="mt-6 text-center text-zinc-400 text-base sm:text-lg max-w-xl leading-relaxed animate-fade-in-up">
        The Tester That Never Sleeps or Misses a Bug.
      </p>

      {/* URL form */}
      <form onSubmit={onSubmit} className="mt-12 w-full max-w-2xl animate-fade-in-up">
        <div className="group flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-xl px-4 py-3 transition-all duration-150 focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:shadow-lg focus-within:shadow-blue-500/10">
          <Globe className="size-5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com  or  http://localhost:3000"
            className="flex-1 bg-transparent outline-none text-base text-zinc-100 placeholder:text-zinc-600 font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="default"
            disabled={!url.trim() || isStarting}
            className="rounded-xl min-w-[110px]"
          >
            {isStarting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                Run QA
                <ArrowUp className="size-4" />
              </>
            )}
          </Button>
        </div>
        <p className="mt-3 text-xs text-zinc-500 text-center">
          Press{" "}
          <kbd className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-zinc-300 text-[10px] font-mono">
            Enter
          </kbd>{" "}
          to launch the agent. Localhost works.
        </p>
      </form>

      {/* Feature pills — subtle, sets expectations for what the agent does */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl w-full animate-fade-in-up">
        <FeaturePill title="Explores" body="Walks the site like a tester — navigate, click, type, extract." />
        <FeaturePill title="Generates" body="Writes test cases as it discovers features and forms." />
        <FeaturePill title="Reports" body="Real bugs separated from broken tests, with reproduction steps." />
        </div>
      </div>

      {/* Flowchart of the agent's run lifecycle. */}
      <AgentFlow />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function FeaturePill({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm p-4 transition-colors hover:border-zinc-700/80">
      <div className="text-xs font-semibold text-zinc-200 mb-1">{title}</div>
      <div className="text-xs text-zinc-500 leading-relaxed">{body}</div>
    </div>
  );
}
