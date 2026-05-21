// Zero-dependency stacked bar chart for bug trends over time.
//
// Rendered as inline SVG — no charting library, so it adds zero bundle weight
// and can't break on a flaky npm install. Each day is a stacked bar split by
// severity (critical/high/medium/low).

import type { TrendPoint } from "@/lib/dashboardApi";

const SEVERITY = [
  { key: "critical", color: "#dc2626" },
  { key: "high", color: "#ea580c" },
  { key: "medium", color: "#ca8a04" },
  { key: "low", color: "#65a30d" },
] as const;

interface Props {
  series: TrendPoint[];
  height?: number;
}

export function BugTrendsChart({ series, height = 180 }: Props) {
  if (series.length === 0) {
    return (
      <div className="grid place-items-center text-zinc-500 text-sm" style={{ height }}>
        No bug data in this window.
      </div>
    );
  }

  const width = 640;
  const padding = { top: 10, right: 10, bottom: 24, left: 28 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const totals = series.map((d) => d.critical + d.high + d.medium + d.low);
  const max = Math.max(1, ...totals);
  const barGap = 4;
  const barW = Math.max(2, chartW / series.length - barGap);

  // Y-axis ticks at 0, max/2, max.
  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Bug trends over time">
        {/* gridlines + y labels */}
        {ticks.map((t) => {
          const y = padding.top + chartH - (t / max) * chartH;
          return (
            <g key={t}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#27272a" strokeWidth={1} />
              <text x={4} y={y + 3} fontSize={9} fill="#71717a">
                {t}
              </text>
            </g>
          );
        })}

        {/* stacked bars */}
        {series.map((d, i) => {
          const x = padding.left + i * (barW + barGap);
          let yCursor = padding.top + chartH;
          return (
            <g key={d.date}>
              {SEVERITY.map((s) => {
                const value = d[s.key];
                if (value <= 0) return null;
                const h = (value / max) * chartH;
                yCursor -= h;
                return <rect key={s.key} x={x} y={yCursor} width={barW} height={h} fill={s.color} rx={1} />;
              })}
              {/* sparse x labels: first, middle, last */}
              {(i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2)) && (
                <text x={x + barW / 2} y={height - 8} fontSize={8} fill="#71717a" textAnchor="middle">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex gap-3 mt-2 flex-wrap">
        {SEVERITY.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.key}
          </span>
        ))}
      </div>
    </div>
  );
}
