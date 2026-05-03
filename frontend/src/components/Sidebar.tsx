import { Plus, Sparkles, Activity, Bug, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSessionStore } from "@/store/useSessionStore";
import { useStore } from "@/store/useStore";

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar (left) — purpose pared down for the multi-session architecture.
//
// The history list now lives in `RunHistorySidebar` (right side). What stays
// here: brand, "New Run" entry point (which sends the user back to Home), and
// a compact summary of the active run (steps / tests / bugs counts).
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const goHome = useSessionStore((s) => s.goHome);
  const stepsCount = useStore((s) => s.steps.length);
  const testsCount = useStore((s) => s.testCases.length);
  const bugsCount = useStore((s) => s.bugs.length);

  return (
    <aside className="hidden md:flex md:flex-col w-[260px] shrink-0 border-r border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-zinc-800/80">
        <div className="size-7 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 grid place-items-center shadow-sm">
          <Sparkles className="size-4 text-zinc-50" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-zinc-100">QA Agent</span>
          <span className="text-[10px] text-zinc-500 tracking-wide uppercase">
            deep agent
          </span>
        </div>
      </div>

      {/* New Run — snapshots current state into history then routes home so the
          user can pick a fresh URL. */}
      <div className="p-3">
        <Button onClick={goHome} className="w-full justify-center">
          <Plus className="size-4" />
          New Run
        </Button>
      </div>

      {/* Active run summary — quick-glance counters that mirror the tab badges
          in the main pane. Subscribers are scoped per-counter so unrelated
          updates don't re-render the whole panel. */}
      <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-500">
        Active Run
      </div>

      <div className="px-3 space-y-1">
        <SummaryRow icon={Activity} label="Steps" value={stepsCount} />
        <SummaryRow icon={ListChecks} label="Tests" value={testsCount} />
        <SummaryRow
          icon={Bug}
          label="Bugs"
          value={bugsCount}
          highlight={bugsCount > 0}
        />
      </div>

      <div className="flex-1" />

      {/* Footer */}
      <div className="border-t border-zinc-800/80 p-3 text-[11px] text-zinc-500">
        <div className="flex items-center justify-between">
          <span>v0.2.0 · mock data</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            online
          </span>
        </div>
      </div>
    </aside>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl px-3 py-2 hover:bg-zinc-900/60 transition-colors">
      <Icon className="size-4 text-zinc-500" />
      <span className="text-xs text-zinc-300 flex-1">{label}</span>
      <Badge variant={highlight ? "danger" : "muted"}>{value}</Badge>
    </div>
  );
}
