import { useState, type FormEvent } from "react";
import { ArrowUp, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";

export function RunInput() {
  const url = useStore((s) => s.url);
  const setUrl = useStore((s) => s.setUrl);
  const startRun = useStore((s) => s.startRun);
  const status = useStore((s) => s.status);
  const [draft, setDraft] = useState(url);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setUrl(draft);
    startRun(draft);
  };

  // Keep the input mirroring the store when the user picks a different run
  // from the sidebar — but don't fight them while they're typing.
  if (url && draft === "" && status !== "running") {
    setDraft(url);
  }

  const isRunning = status === "running";

  return (
    <div className="border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <form onSubmit={onSubmit} className="px-5 py-4">
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 transition-colors focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20">
          <Globe className="size-4 text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="https://example.com or http://localhost:3000"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-zinc-100 placeholder:text-zinc-500 font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!draft.trim() || isRunning}
            className="rounded-xl px-3"
          >
            {isRunning ? (
              <>Running…</>
            ) : (
              <>
                Run QA
                <ArrowUp className="size-3.5" />
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Press <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300 text-[10px] font-mono">Enter</kbd> to launch the agent. The current run will replace the active session.
        </p>
      </form>
    </div>
  );
}
