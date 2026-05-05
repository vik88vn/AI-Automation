import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Home as HomeIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { useSessionStore } from "@/store/useSessionStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";
import {
  RunStatuses,
  type Run,
  type RunStatus,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// RunHistorySidebar — right side, persistent multi-session view.
//
// Each row is a `Run` with id / url / timestamp / status. Clicking it calls
// `selectRun(id)`, which hydrates the live store with that run's snapshot
// (including the full AppModel) so the dashboard re-renders with historical
// data. The currently-active run is highlighted; switching away from it first
// snapshots its live state back into history so nothing is lost.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<RunStatus, string> = {
  [RunStatuses.Running]: "bg-amber-400",
  [RunStatuses.Completed]: "bg-emerald-400",
  [RunStatuses.Failed]: "bg-red-400",
  [RunStatuses.Queued]: "bg-zinc-500",
};

const STATUS_ICON: Record<
  RunStatus,
  React.ComponentType<{ className?: string }>
> = {
  [RunStatuses.Running]: Loader2,
  [RunStatuses.Completed]: CheckCircle2,
  [RunStatuses.Failed]: AlertTriangle,
  [RunStatuses.Queued]: Clock,
};

const STATUS_BADGE_VARIANT: Record<
  RunStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  [RunStatuses.Running]: "warning",
  [RunStatuses.Completed]: "success",
  [RunStatuses.Failed]: "danger",
  [RunStatuses.Queued]: "muted",
};

export function RunHistorySidebar() {
  const runs = useSessionStore((s) => s.runs);
  const activeRunId = useSessionStore((s) => s.activeRunId);
  const selectRun = useSessionStore((s) => s.selectRun);
  const clearHistory = useSessionStore((s) => s.clearHistory);
  const goHome = useSessionStore((s) => s.goHome);

  return (
    <aside className="hidden lg:flex lg:flex-col w-[300px] shrink-0 border-l border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-800/80">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-zinc-100">
            Run History
          </span>
          <span className="text-[10px] text-zinc-500 tracking-wide uppercase">
            {runs.length} {runs.length === 1 ? "session" : "sessions"}
          </span>
        </div>
        <Button
          variant="icon"
          size="icon"
          onClick={goHome}
          title="Back to home"
          aria-label="Back to home"
        >
          <HomeIcon className="size-4" />
        </Button>
      </div>

      {/* List */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {runs.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">
            No runs yet — start one from the home page.
          </div>
        )}
        {runs.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            active={run.id === activeRunId}
            onClick={() => selectRun(run.id)}
          />
        ))}
      </nav>

      {/* Footer */}
      {runs.length > 1 && (
        <div className="border-t border-zinc-800/80 p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={clearHistory}
            className="w-full justify-center text-zinc-400 hover:text-red-300 hover:border-red-500/40"
            title="Remove all runs except the active one"
          >
            <Trash2 className="size-3.5" />
            Clear history
          </Button>
        </div>
      )}
    </aside>
  );
}

interface RunRowProps {
  run: Run;
  active: boolean;
  onClick: () => void;
}

function RunRow({ run, active, onClick }: RunRowProps) {
  const Icon = STATUS_ICON[run.status];
  const tests = run.snapshot.testCases.length;
  const bugs = run.snapshot.bugs.length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full flex flex-col gap-2 rounded-2xl px-3 py-2.5 text-left transition-all duration-150 animate-fade-in-up",
        active
          ? "bg-zinc-800/80 ring-1 ring-zinc-700/80"
          : "hover:bg-zinc-900/80"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            STATUS_DOT[run.status],
            run.status === RunStatuses.Running && "animate-pulse-soft"
          )}
          aria-hidden
        />
        <Globe className="size-3 text-zinc-500 shrink-0" />
        <span className="font-mono text-xs text-zinc-200 truncate flex-1">
          {run.url.replace(/^https?:\/\//, "")}
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <Icon
          className={cn(
            "size-3",
            run.status === RunStatuses.Running && "animate-spin",
            run.status === RunStatuses.Failed && "text-red-400",
            run.status === RunStatuses.Completed && "text-emerald-400"
          )}
        />
        <Badge
          variant={STATUS_BADGE_VARIANT[run.status]}
          className="text-[10px] capitalize px-1.5 py-0"
        >
          {run.status}
        </Badge>
        <span className="ml-auto">{run.startedAt ? relativeTime(run.startedAt) : "—"}</span>
      </div>

      {(tests > 0 || bugs > 0) && (
        <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono">
          <span>tests: {tests}</span>
          <span className={cn(bugs > 0 && "text-red-400")}>bugs: {bugs}</span>
          <span className="ml-auto opacity-60">{run.id}</span>
        </div>
      )}
    </button>
  );
}
