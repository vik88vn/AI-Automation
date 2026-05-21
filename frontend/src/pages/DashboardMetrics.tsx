// Executive dashboard page — composes metrics cards, trends chart, and team
// activity for a single project. Fetches from the SaaS metrics endpoints.
//
// Requires an authenticated session (JWT in localStorage). If unauthenticated
// or no project is selected, it renders a helpful empty state.

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BugTrendsChart } from "@/components/BugTrendsChart";
import { MetricsCards } from "@/components/MetricsCards";
import {
  fetchMetrics,
  fetchTrends,
  fetchActivity,
  getAccessToken,
  type ProjectMetrics,
  type TrendsResponse,
  type ActivityResponse,
} from "@/lib/dashboardApi";

interface Props {
  projectId: string | null;
}

export function DashboardMetrics({ projectId }: Props) {
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    if (!getAccessToken()) {
      setError("Sign in to view dashboard metrics.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchMetrics(projectId), fetchTrends(projectId, 30), fetchActivity(projectId)])
      .then(([m, t, a]) => {
        if (cancelled) return;
        setMetrics(m);
        setTrends(t);
        setActivity(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load metrics");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="grid place-items-center h-64 text-zinc-500 text-sm">
        Select a project to view its dashboard.
      </div>
    );
  }
  if (error) {
    return <div className="grid place-items-center h-64 text-amber-400 text-sm">{error}</div>;
  }
  if (loading || !metrics || !trends || !activity) {
    return <div className="grid place-items-center h-64 text-zinc-500 text-sm">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <MetricsCards metrics={metrics} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Bug trends (last {trends.days} days)</CardTitle>
        </CardHeader>
        <CardContent>
          <BugTrendsChart series={trends.series} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.recentRuns.length === 0 && <div className="text-sm text-zinc-500">No runs yet.</div>}
            {activity.recentRuns.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 truncate max-w-[60%]">{r.url}</span>
                <span className="text-zinc-500 text-xs">
                  {r.testsPassed}/{r.testsTotal} · {r.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top assignees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.leaderboard.length === 0 && <div className="text-sm text-zinc-500">No assignments yet.</div>}
            {activity.leaderboard.map((entry, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">{entry.user?.firstName || entry.user?.email || "Unknown"}</span>
                <span className="text-zinc-500 text-xs">{entry.count} bug(s)</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
