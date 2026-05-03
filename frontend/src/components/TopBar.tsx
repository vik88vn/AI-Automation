import { Play, Square, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  queued: "Idle",
} as const;

const STATUS_DOT = {
  running: "bg-amber-400 animate-pulse-soft",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  queued: "bg-zinc-500",
} as const;

export function TopBar() {
  const status = useStore((s) => s.status);
  const url = useStore((s) => s.url);
  const startRun = useStore((s) => s.startRun);
  const stopRun = useStore((s) => s.stopRun);

  const isRunning = status === "running";

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
            <Button variant="destructive" size="sm" onClick={stopRun}>
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => startRun(url)}
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
