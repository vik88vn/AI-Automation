import { useEffect, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  MousePointerClick,
  Type as TypeIcon,
  Camera,
  Search,
  PlayCircle,
  Bug as BugIcon,
  Sparkles,
  Database,
  ListPlus,
  Flag,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { cn, formatTime } from "@/lib/utils";
import { PerformanceMetricsBadge } from "@/components/PerformanceBreakdown";
import type { ExecutionStep, StepKind } from "@/lib/mockData";

const KIND_ICON: Record<StepKind, React.ComponentType<{ className?: string }>> = {
  navigate: ArrowRight,
  click: MousePointerClick,
  type: TypeIcon,
  extract: Search,
  screenshot: Camera,
  run_test: PlayCircle,
  report_bug: BugIcon,
  analysis: Sparkles,
  record_observation: Database,
  add_test: ListPlus,
  finish: Flag,
};

const KIND_COLOR: Record<StepKind, string> = {
  navigate: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  click: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  type: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  extract: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  screenshot: "text-pink-300 bg-pink-500/10 border-pink-500/20",
  run_test: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  report_bug: "text-red-300 bg-red-500/10 border-red-500/20",
  analysis: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20",
  record_observation: "text-teal-300 bg-teal-500/10 border-teal-500/20",
  add_test: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20",
  finish: "text-zinc-300 bg-zinc-500/10 border-zinc-500/20",
};

export function ExecutionFeed() {
  const steps = useStore((s) => s.steps);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest step. Only when the user is already near the
  // bottom — we don't want to fight a manual scroll-up to read history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [steps.length]);

  if (steps.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-center text-zinc-500 p-10">
        <div className="space-y-3 max-w-sm">
          <div className="size-10 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto grid place-items-center">
            <Sparkles className="size-5 text-zinc-400" />
          </div>
          <h3 className="text-zinc-300 font-medium">No execution yet</h3>
          <p className="text-xs">
            Enter a URL below and click Run QA. Live agent steps will stream here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-3"
    >
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </div>
  );
}

function StepRow({ step }: { step: ExecutionStep }) {
  const Icon = KIND_ICON[step.kind] ?? ArrowRight;
  const color = KIND_COLOR[step.kind] ?? KIND_COLOR.navigate;
  const ok = step.result === "success";

  return (
    <div className="group flex gap-3 animate-fade-in-up">
      {/* Step number rail */}
      <div className="flex flex-col items-center pt-1">
        <div
          className={cn(
            "size-7 rounded-full grid place-items-center text-[10px] font-mono font-medium border",
            color
          )}
        >
          {step.step}
        </div>
        <div className="flex-1 w-px bg-zinc-800/80 mt-1" aria-hidden />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border", color)}>
            <Icon className="size-3" />
            {step.kind}
          </span>
          <span className="font-mono text-xs text-zinc-300 truncate">
            {step.target}
          </span>
          <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">
            {formatTime(step.timestamp)}
          </span>
        </div>

        {step.reason && (
          <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
            {step.reason}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
          {ok ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="size-3" />
              success
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-400">
              <XCircle className="size-3" />
              failure
            </span>
          )}
          {step.detail && (
            <span className="font-mono text-zinc-500 truncate">
              · {step.detail}
            </span>
          )}
          {step.metrics && (
            <PerformanceMetricsBadge metrics={step.metrics} />
          )}
        </div>
      </div>
    </div>
  );
}
