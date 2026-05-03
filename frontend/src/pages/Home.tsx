import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Globe, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/useSessionStore";
import { useStore } from "@/store/useStore";
import { SettingsModal } from "@/components/SettingsModal";

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
  const lastUrl = useStore((s) => s.url);
  const [url, setUrl] = useState(lastUrl ?? "");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    startNewRun(trimmed);
  };

  return (
    <div className="relative min-h-full flex flex-col items-center justify-center px-6 py-16 overflow-hidden flex-1">
      {/* Ambient backdrop — subtle gradient orbs that don't compete with content */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute top-[40%] left-1/3 h-[320px] w-[420px] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-[10%] right-[10%] h-[280px] w-[380px] rounded-full bg-fuchsia-500/5 blur-3xl" />
      </div>

      {/* Brand mark */}
      <div className="flex items-center gap-2 mb-10 animate-fade-in-up">
        <div className="size-8 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 grid place-items-center shadow-lg shadow-blue-500/20">
          <Sparkles className="size-4 text-zinc-50" />
        </div>
        <span className="text-sm font-semibold text-zinc-300 tracking-wide">
          QA Agent
        </span>
      </div>

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
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com  ·  or  http://localhost:3000"
            className="flex-1 bg-transparent outline-none text-base text-zinc-100 placeholder:text-zinc-600 font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <Button type="submit" size="default" disabled={!url.trim()} className="rounded-xl">
            Run QA
            <ArrowUp className="size-4" />
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
