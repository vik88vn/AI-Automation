import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug as BugIcon, ExternalLink, Wrench, Loader2, CheckCircle2 } from "lucide-react";
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

const SETTINGS_KEY = "ai-qa-deep-agent.settings.v1";

function readProjectRoot(): string {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { projectRoot?: string };
    return parsed.projectRoot ?? "";
  } catch {
    return "";
  }
}

export function BugList() {
  const bugs = useStore((s) => s.bugs);
  const [fixingBugs, setFixingBugs] = useState<Record<string, "fixing" | "done" | "error">>({});

  const handleFix = async (bug: typeof bugs[0]) => {
    const projectRoot = readProjectRoot();
    if (!projectRoot) {
      alert("Set your project root path in Settings before using Fix.");
      return;
    }
    setFixingBugs((s) => ({ ...s, [bug.id]: "fixing" }));
    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bug: {
            id: bug.id,
            title: bug.title,
            severity: bug.severity,
            description: bug.description,
            reproSteps: bug.reproSteps,
            expected: bug.expected,
            actual: bug.actual,
            url: bug.url,
            evidence: bug.evidence,
          },
          projectRoot,
          targetUrl: bug.url,
        }),
      });
      if (!res.ok) {
        throw new Error(`Fix failed: ${res.status}`);
      }
      // SSE stream — read events until done
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let running = true;
        while (running) {
          const { done, value } = await reader.read();
          if (done) { running = false; break; }
          const text = decoder.decode(value);
          if (text.includes('"fix_done"') || text.includes('event: done')) {
            setFixingBugs((s) => ({ ...s, [bug.id]: "done" }));
            running = false;
          } else if (text.includes('"fix_error"')) {
            setFixingBugs((s) => ({ ...s, [bug.id]: "error" }));
            running = false;
          }
        }
      }
    } catch {
      setFixingBugs((s) => ({ ...s, [bug.id]: "error" }));
    }
  };

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
            <div className="flex items-center gap-2 shrink-0">
              {fixingBugs[bug.id] === "fixing" ? (
                <Badge variant="warning" className="gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Fixing…
                </Badge>
              ) : fixingBugs[bug.id] === "done" ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  Fixed
                </Badge>
              ) : fixingBugs[bug.id] === "error" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFix(bug)}
                  className="gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                >
                  <Wrench className="size-3" />
                  Retry
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFix(bug)}
                  className="gap-1"
                >
                  <Wrench className="size-3" />
                  Fix
                </Button>
              )}
              <a
                href={bug.url}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-500 hover:text-zinc-200 transition-colors"
                title={bug.url}
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
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
