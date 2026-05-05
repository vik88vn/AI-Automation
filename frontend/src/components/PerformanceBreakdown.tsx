import type { PerformanceMetrics } from "@/types";
import { Activity, Gauge, Zap } from "lucide-react";

interface PerformanceBreakdownProps {
  metrics: PerformanceMetrics;
  title?: string;
  compact?: boolean;
}

export function PerformanceBreakdown({
  metrics,
  title = "Performance",
  compact = false,
}: PerformanceBreakdownProps) {
  const { componentBreakdown, fcp, lcp, tti } = metrics;
  const totalMs = componentBreakdown.waitMs + componentBreakdown.actionMs + componentBreakdown.postActionMs;

  // Format metric value, handling undefined
  const formatMetric = (value: number | undefined) => {
    if (value === undefined) return "—";
    return `${Math.round(value)}ms`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <div className="flex items-center gap-1" title={`FCP: ${formatMetric(fcp)}`}>
          <Zap className="size-3" />
          <span>{formatMetric(fcp)}</span>
        </div>
        <div className="flex items-center gap-1" title={`LCP: ${formatMetric(lcp)}`}>
          <Activity className="size-3" />
          <span>{formatMetric(lcp)}</span>
        </div>
        <div className="flex items-center gap-1" title={`Total: ${totalMs}ms`}>
          <Gauge className="size-3" />
          <span>{totalMs}ms</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm">
      <h4 className="text-xs font-semibold text-zinc-300">{title}</h4>

      {/* Component breakdown bar chart */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-16">Breakdown:</span>
          <div className="flex-1 flex items-center gap-0 h-5 rounded-sm overflow-hidden bg-zinc-800">
            {/* Wait time */}
            {componentBreakdown.waitMs > 0 && (
              <div
                className="bg-blue-500/70 h-full"
                style={{ width: `${(componentBreakdown.waitMs / totalMs) * 100}%` }}
                title={`Wait: ${componentBreakdown.waitMs}ms`}
              />
            )}
            {/* Action time */}
            <div
              className="bg-green-500/70 h-full"
              style={{ width: `${(componentBreakdown.actionMs / totalMs) * 100}%` }}
              title={`Action: ${componentBreakdown.actionMs}ms`}
            />
            {/* Post-action time */}
            <div
              className="bg-purple-500/70 h-full"
              style={{ width: `${(componentBreakdown.postActionMs / totalMs) * 100}%` }}
              title={`Post-action: ${componentBreakdown.postActionMs}ms`}
            />
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {componentBreakdown.waitMs > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-blue-500/70" />
              <span className="text-zinc-400">Wait {componentBreakdown.waitMs}ms</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-green-500/70" />
            <span className="text-zinc-400">Action {componentBreakdown.actionMs}ms</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-purple-500/70" />
            <span className="text-zinc-400">Settle {componentBreakdown.postActionMs}ms</span>
          </div>
        </div>
      </div>

      {/* Core Web Vitals */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded bg-zinc-800/50 px-2 py-1.5">
          <div className="text-xs text-zinc-500 font-medium">FCP</div>
          <div className="text-sm font-semibold text-zinc-100">{formatMetric(fcp)}</div>
        </div>
        <div className="rounded bg-zinc-800/50 px-2 py-1.5">
          <div className="text-xs text-zinc-500 font-medium">LCP</div>
          <div className="text-sm font-semibold text-zinc-100">{formatMetric(lcp)}</div>
        </div>
        <div className="rounded bg-zinc-800/50 px-2 py-1.5">
          <div className="text-xs text-zinc-500 font-medium">TTI</div>
          <div className="text-sm font-semibold text-zinc-100">{formatMetric(tti)}</div>
        </div>
      </div>

      {/* Total timing */}
      <div className="text-xs text-zinc-400 border-t border-zinc-800 pt-2">
        Total: <span className="font-semibold text-zinc-200">{totalMs}ms</span>
      </div>
    </div>
  );
}

export function PerformanceMetricsBadge({ metrics }: { metrics: PerformanceMetrics }) {
  const { componentBreakdown, fcp } = metrics;
  const totalMs = componentBreakdown.waitMs + componentBreakdown.actionMs + componentBreakdown.postActionMs;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 font-mono">
      <Gauge className="size-3" />
      <span>{totalMs}ms</span>
      {fcp !== undefined && <span>· FCP {Math.round(fcp)}ms</span>}
    </div>
  );
}
