import { Play, Square, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { useSessionStore } from "@/store/useSessionStore";
import { cn } from "@/lib/utils";
import { RunStatuses, type RunStatus } from "@/types";

const STATUS_LABEL: Record<RunStatus, string> = {
  [RunStatuses.Running]: "Running",
  [RunStatuses.Completed]: "Completed",
  [RunStatuses.Failed]: "Failed",
  [RunStatuses.Queued]: "Idle",
};

const STATUS_DOT: Record<RunStatus, string> = {
  [RunStatuses.Running]: "bg-amber-400 animate-pulse-soft",
  [RunStatuses.Completed]: "bg-emerald-400",
  [RunStatuses.Failed]: "bg-red-400",
  [RunStatuses.Queued]: "bg-zinc-500",
};

export function TopBar() {
  const status = useStore((s) => s.status);
  const url = useStore((s) => s.url);
  // Lifecycle now goes through the session store. Start = create a new run
  // (snapshots prior, hydrates fresh). Stop = mark active run completed.
  const startNewRun = useSessionStore((s) => s.startNewRun);
  const endActiveRun = useSessionStore((s) => s.endActiveRun);

  const isRunning = status === RunStatuses.Running;

  return (
    <div className="h-14 shrink-0 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl">
      <div className="h-full px-5 flex items-center gap-3">
        {/* URL display */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Globe className="size-4 text-zinc-500 shrink-0" />
          <div className="min-w-0 flex items-center gap-2">
            <span className="font-mono text-sm text-zinc-300 truncate">
              {url || "no run selected"}
            </span>
          </div>
        </div>

        {/* Status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
          <span
            className={cn("size-2 rounded-full", STATUS_DOT[status])}
            aria-hidden
          />
          <span className="text-xs font-medium text-zinc-300">
            {STATUS_LABEL[status]}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => endActiveRun(RunStatuses.Completed)}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => startNewRun(url)}
              disabled={!url.trim()}
            >
              <Play className="size-3.5" />
              Start
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
