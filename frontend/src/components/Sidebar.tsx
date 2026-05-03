import { Plus, Sparkles, Globe, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { cn, relativeTime } from "@/lib/utils";
import type { RunStatus } from "@/lib/mockData";

const STATUS_DOT: Record<RunStatus, string> = {
  running: "bg-amber-400",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  queued: "bg-zinc-500",
};

const STATUS_ICON = {
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertTriangle,
  queued: Globe,
} as const;

export function Sidebar() {
  const runs = useStore((s) => s.runsHistory);
  const currentRunId = useStore((s) => s.currentRunId);
  const selectRun = useStore((s) => s.selectRun);
  const newRun = useStore((s) => s.newRun);

  return (
    <aside className="hidden md:flex md:flex-col w-[260px] shrink-0 border-r border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-zinc-800/80">
        <div className="size-7 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 grid place-items-center shadow-sm">
          <Sparkles className="size-4 text-zinc-50" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-zinc-100">QA Agent</span>
          <span className="text-[10px] text-zinc-500 tracking-wide uppercase">deep agent</span>
        </div>
      </div>

      {/* New Run */}
      <div className="p-3">
        <Button onClick={newRun} className="w-full justify-center">
          <Plus className="size-4" />
          New Run
        </Button>
      </div>

      {/* History header */}
      <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
        Recent Runs
      </div>

      {/* Run list */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {runs.map((r) => {
          const Icon = STATUS_ICON[r.status];
          const active = r.id === currentRunId;
          return (
            <button
              key={r.id}
              onClick={() => selectRun(r.id)}
              className={cn(
                "group w-full flex items-center gap-3 rounded-2xl px-3 py-2 text-left transition-all duration-150",
                active
                  ? "bg-zinc-800/80 ring-1 ring-zinc-700/80"
                  : "hover:bg-zinc-900/80"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full flex-shrink-0",
                  STATUS_DOT[r.status],
                  r.status === "running" && "animate-pulse-soft"
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {r.url.replace(/^https?:\/\//, "")}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <Icon
                    className={cn(
                      "size-3",
                      r.status === "running" && "animate-spin",
                      r.status === "failed" && "text-red-400",
                      r.status === "completed" && "text-emerald-400"
                    )}
                  />
                  <span className="capitalize">{r.status}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeTime(r.startedAt)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800/80 p-3 text-[11px] text-zinc-500">
        <div className="flex items-center justify-between">
          <span>v0.1.0 · mock data</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            online
          </span>
        </div>
      </div>
    </aside>
  );
}
