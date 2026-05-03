import { Badge } from "@/components/ui/badge";
import { useStore } from "@/store/useStore";
import { cn } from "@/lib/utils";
import type { TestStatus } from "@/lib/mockData";

const STATUS_BADGE: Record<TestStatus, { variant: React.ComponentProps<typeof Badge>["variant"]; label: string }> = {
  passed: { variant: "success", label: "Passed" },
  failed: { variant: "danger", label: "Failed" },
  running: { variant: "warning", label: "Running" },
  queued: { variant: "muted", label: "Queued" },
};

const PRIORITY_BADGE = {
  high: "danger",
  medium: "warning",
  low: "muted",
} as const;

export function TestTable() {
  const tests = useStore((s) => s.testCases);

  if (tests.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-zinc-500 text-sm">
        No tests yet — they appear once the agent generates them.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur z-10">
          <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80">
            <th className="px-5 py-3 font-medium">ID</th>
            <th className="px-5 py-3 font-medium">Title</th>
            <th className="px-5 py-3 font-medium">Type</th>
            <th className="px-5 py-3 font-medium">Priority</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium text-right">Attempts</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => {
            const badge = STATUS_BADGE[t.status];
            return (
              <tr
                key={t.id}
                className={cn(
                  "border-b border-zinc-800/60 transition-colors hover:bg-zinc-900/40 animate-fade-in-up"
                )}
              >
                <td className="px-5 py-3 font-mono text-xs text-zinc-400">
                  {t.id}
                </td>
                <td className="px-5 py-3 text-zinc-200">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                    expected: {t.expected}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <Badge variant="default" className="font-mono text-[10px]">
                    {t.type}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={PRIORITY_BADGE[t.priority]} className="capitalize">
                    {t.priority}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge variant={badge.variant}>
                    {t.status === "running" && (
                      <span className="size-1.5 rounded-full bg-amber-300 animate-pulse-soft" />
                    )}
                    {badge.label}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-right text-zinc-400 tabular-nums">
                  {t.attempts}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
