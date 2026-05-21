// Dashboard metrics routes: aggregate counts, trends over time, team activity.
//
// All endpoints are project-scoped and tenant-isolated (caller must own or be
// a member of the project). These power the executive dashboard.

import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedUser } from "../auth/middleware.js";
import { sendJson, HttpError, matchPath } from "../lib/http.js";
import { respondError } from "./auth.js";

// Project-access predicate (owner, member, or ADMIN).
function accessFilter(user: AuthedUser) {
  if (user.role === "ADMIN") return {};
  return { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
}

async function assertProjectAccess(projectId: string, user: AuthedUser): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...accessFilter(user) },
    select: { id: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
}

// GET /api/projects/:id/metrics — counts by severity/type/status + pass rate.
async function getMetrics(req: IncomingMessage, res: ServerResponse, projectId: string): Promise<void> {
  const user = requireAuth(req);
  await assertProjectAccess(projectId, user);

  const runWhere = { run: { projectId } };

  const [bySeverity, byType, byStatus, runAgg, totalBugs, recentRuns] = await Promise.all([
    prisma.bug.groupBy({ by: ["severity"], where: runWhere, _count: { _all: true } }),
    prisma.bug.groupBy({ by: ["type"], where: runWhere, _count: { _all: true } }),
    prisma.bug.groupBy({ by: ["status"], where: runWhere, _count: { _all: true } }),
    prisma.run.aggregate({
      where: { projectId },
      _sum: { testsTotal: true, testsPassed: true, testsFailed: true },
      _count: { _all: true },
    }),
    prisma.bug.count({ where: runWhere }),
    prisma.run.count({ where: { projectId } }),
  ]);

  const tally = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string) =>
    Object.fromEntries(rows.map((r) => [String(r[key]), r._count._all]));

  const testsTotal = runAgg._sum.testsTotal ?? 0;
  const testsPassed = runAgg._sum.testsPassed ?? 0;

  sendJson(res, 200, {
    totalBugs,
    totalRuns: recentRuns,
    passRate: testsTotal > 0 ? Math.round((testsPassed / testsTotal) * 1000) / 10 : null,
    tests: {
      total: testsTotal,
      passed: testsPassed,
      failed: runAgg._sum.testsFailed ?? 0,
    },
    bySeverity: tally(bySeverity, "severity"),
    byType: tally(byType, "type"),
    byStatus: tally(byStatus, "status"),
  });
}

// GET /api/projects/:id/trends?days=30 — bug counts per day, split by severity.
async function getTrends(req: IncomingMessage, res: ServerResponse, projectId: string, url: URL): Promise<void> {
  const user = requireAuth(req);
  await assertProjectAccess(projectId, user);

  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const bugs = await prisma.bug.findMany({
    where: { run: { projectId }, createdAt: { gte: since } },
    select: { createdAt: true, severity: true },
    orderBy: { createdAt: "asc" },
  });

  // Bucket by YYYY-MM-DD, counting per severity.
  const buckets = new Map<string, { critical: number; high: number; medium: number; low: number }>();
  for (const b of bugs) {
    const day = b.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(day) ?? { critical: 0, high: 0, medium: 0, low: 0 };
    const sev = b.severity.toLowerCase() as keyof typeof bucket;
    if (sev in bucket) bucket[sev] += 1;
    buckets.set(day, bucket);
  }

  const series = [...buckets.entries()]
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  sendJson(res, 200, { days, series });
}

// GET /api/projects/:id/activity — recent runs, assignments, and comments.
async function getActivity(req: IncomingMessage, res: ServerResponse, projectId: string): Promise<void> {
  const user = requireAuth(req);
  await assertProjectAccess(projectId, user);

  const [recentRuns, recentComments, assigneeRollup] = await Promise.all([
    prisma.run.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        url: true,
        status: true,
        createdAt: true,
        testsTotal: true,
        testsPassed: true,
        testsFailed: true,
        user: { select: { id: true, email: true, firstName: true } },
      },
    }),
    prisma.bugComment.findMany({
      where: { bug: { run: { projectId } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        author: { select: { id: true, email: true, firstName: true } },
        bug: { select: { id: true, title: true } },
      },
    }),
    prisma.bug.groupBy({
      by: ["assignedToId"],
      where: { run: { projectId }, assignedToId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // Resolve assignee ids → emails for the leaderboard.
  const assigneeIds = assigneeRollup.map((a) => a.assignedToId).filter((x): x is string => !!x);
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, email: true, firstName: true },
      })
    : [];
  const assigneeMap = new Map(assignees.map((u) => [u.id, u]));
  const leaderboard = assigneeRollup
    .map((a) => ({
      user: a.assignedToId ? assigneeMap.get(a.assignedToId) ?? null : null,
      count: a._count._all,
    }))
    .sort((x, y) => y.count - x.count);

  sendJson(res, 200, { recentRuns, recentComments, leaderboard });
}

export async function handleMetricsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? "GET";
  if (method !== "GET") return false;

  try {
    const metrics = matchPath("/api/projects/:id/metrics", pathname);
    if (metrics) {
      await getMetrics(req, res, metrics.id);
      return true;
    }
    const trends = matchPath("/api/projects/:id/trends", pathname);
    if (trends) {
      await getTrends(req, res, trends.id, url);
      return true;
    }
    const activity = matchPath("/api/projects/:id/activity", pathname);
    if (activity) {
      await getActivity(req, res, activity.id);
      return true;
    }
  } catch (err) {
    respondError(res, err);
    return true;
  }
  return false;
}
