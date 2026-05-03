import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bug as BugIcon, ExternalLink } from "lucide-react";
import { useStore } from "@/store/useStore";
import type { Severity } from "@/lib/mockData";

const SEVERITY_VARIANT: Record<
  Severity,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  critical: "critical",
  high: "danger",
  medium: "warning",
  low: "muted",
};

export function BugList() {
  const bugs = useStore((s) => s.bugs);

  if (bugs.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-center text-zinc-500 p-10">
        <div className="space-y-3 max-w-sm">
          <div className="size-10 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto grid place-items-center">
            <BugIcon className="size-5 text-zinc-400" />
          </div>
          <h3 className="text-zinc-300 font-medium">No bugs reported</h3>
          <p className="text-xs">
            Bugs found by the agent or post-test analysis appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
      {bugs.map((bug) => (
        <Card key={bug.id} className="animate-fade-in-up">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={SEVERITY_VARIANT[bug.severity]} className="uppercase tracking-wider">
                  {bug.severity}
                </Badge>
                <span className="font-mono text-[11px] text-zinc-500">
                  {bug.id}
                </span>
                {bug.testId && (
                  <span className="text-[11px] text-zinc-500">
                    · linked to <span className="font-mono text-zinc-400">{bug.testId}</span>
                  </span>
                )}
              </div>
              <CardTitle className="text-base leading-snug">{bug.title}</CardTitle>
            </div>
            <a
              href={bug.url}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
              title={bug.url}
            >
              <ExternalLink className="size-4" />
            </a>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-300 leading-relaxed">
              {bug.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                  Expected
                </div>
                <p className="text-sm text-emerald-300/90">{bug.expected}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                  Actual
                </div>
                <p className="text-sm text-red-300/90">{bug.actual}</p>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                Steps to reproduce
              </div>
              <ol className="space-y-1.5">
                {bug.reproSteps.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm text-zinc-300 font-mono"
                  >
                    <span className="size-5 rounded-full bg-zinc-800 grid place-items-center text-[10px] text-zinc-400 shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
