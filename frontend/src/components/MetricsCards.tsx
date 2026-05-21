// Executive metric cards + a zero-dependency SVG severity donut.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectMetrics } from "@/lib/dashboardApi";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#ca8a04",
  LOW: "#65a30d",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="text-3xl font-semibold text-zinc-100 mt-1">{value}</div>
        {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// Inline SVG donut showing the severity distribution.
function SeverityDonut({ bySeverity }: { bySeverity: Record<string, number> }) {
  const entries = Object.entries(bySeverity).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) {
    return <div className="grid place-items-center h-40 text-sm text-zinc-500">No bugs yet 🎉</div>;
  }

  const radius = 60;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 160 160" className="size-40 -rotate-90">
        {entries.map(([sev, n]) => {
          const fraction = n / total;
          const dash = fraction * circumference;
          const seg = (
            <circle
              key={sev}
              cx={80}
              cy={80}
              r={radius}
              fill="none"
              stroke={SEVERITY_COLOR[sev] ?? "#666"}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="space-y-1.5">
        {entries.map(([sev, n]) => (
          <div key={sev} className="flex items-center gap-2 text-sm">
            <span className="size-3 rounded-sm" style={{ background: SEVERITY_COLOR[sev] ?? "#666" }} />
            <span className="text-zinc-300 capitalize">{sev.toLowerCase()}</span>
            <span className="text-zinc-500">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricsCards({ metrics }: { metrics: ProjectMetrics }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total bugs" value={metrics.totalBugs} />
        <StatCard label="Total runs" value={metrics.totalRuns} />
        <StatCard
          label="Pass rate"
          value={metrics.passRate != null ? `${metrics.passRate}%` : "—"}
          sub={`${metrics.tests.passed}/${metrics.tests.total} tests`}
        />
        <StatCard label="Open bugs" value={metrics.byStatus.OPEN ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Severity distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <SeverityDonut bySeverity={metrics.bySeverity} />
        </CardContent>
      </Card>
    </div>
  );
}
