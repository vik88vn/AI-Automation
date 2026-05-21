// Export & integration routes: CSV/HTML report download, Jira issue creation,
// Slack run summary. All tenant-isolated through run/bug → project access.

import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedUser } from "../auth/middleware.js";
import { sendJson, HttpError, matchPath } from "../lib/http.js";
import { respondError } from "./auth.js";
import { bugsToCsv, buildHtmlReport } from "../services/export.js";
import { sendSlackSummary, createJiraIssue } from "../services/notify.js";

function accessFilter(user: AuthedUser) {
  if (user.role === "ADMIN") return {};
  return { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
}

async function loadAccessibleRun(runId: string, user: AuthedUser) {
  const run = await prisma.run.findFirst({
    where: { id: runId, project: accessFilter(user) },
    include: { project: { select: { name: true } } },
  });
  if (!run) throw new HttpError(404, "Run not found");
  return run;
}

// POST /api/runs/:id/export?format=csv|html — download a report file.
async function exportRun(req: IncomingMessage, res: ServerResponse, runId: string, url: URL): Promise<void> {
  const user = requireAuth(req);
  const run = await loadAccessibleRun(runId, user);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();

  const bugs = await prisma.bug.findMany({
    where: { runId },
    include: { assignedTo: { select: { email: true } } },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });

  if (format === "html") {
    const html = buildHtmlReport(
      {
        id: run.id,
        url: run.url,
        status: run.status,
        startedAt: run.startedAt,
        testsTotal: run.testsTotal,
        testsPassed: run.testsPassed,
        testsFailed: run.testsFailed,
      },
      bugs,
      run.project.name
    );
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="qa-report-${runId}.html"`,
      "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*",
    });
    res.end(html);
    return;
  }

  if (format === "csv") {
    const csv = bugsToCsv(bugs);
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="qa-bugs-${runId}.csv"`,
      "access-control-allow-origin": process.env.CORS_ORIGIN ?? "*",
    });
    res.end(csv);
    return;
  }

  throw new HttpError(400, "Unsupported format. Use ?format=csv or ?format=html");
}

// POST /api/bugs/:id/jira — create a Jira issue from a bug.
async function bugToJira(req: IncomingMessage, res: ServerResponse, bugId: string): Promise<void> {
  const user = requireAuth(req);
  const bug = await prisma.bug.findFirst({
    where: { id: bugId, run: { project: accessFilter(user) } },
  });
  if (!bug) throw new HttpError(404, "Bug not found");

  const issue = await createJiraIssue({
    summary: bug.title,
    description: `${bug.description}\n\nExpected: ${bug.expected}\nActual: ${bug.actual}`,
    severity: bug.severity,
    url: bug.url,
  });
  sendJson(res, 201, { jira: issue });
}

// POST /api/runs/:id/slack — post a run summary to Slack.
async function runToSlack(req: IncomingMessage, res: ServerResponse, runId: string): Promise<void> {
  const user = requireAuth(req);
  const run = await loadAccessibleRun(runId, user);

  const [bugCount, critical, high] = await Promise.all([
    prisma.bug.count({ where: { runId } }),
    prisma.bug.count({ where: { runId, severity: "CRITICAL" } }),
    prisma.bug.count({ where: { runId, severity: "HIGH" } }),
  ]);

  await sendSlackSummary({
    projectName: run.project.name,
    runUrl: run.url,
    bugCount,
    critical,
    high,
    passRate: run.testsTotal > 0 ? Math.round((run.testsPassed / run.testsTotal) * 1000) / 10 : null,
  });
  sendJson(res, 200, { ok: true, posted: { bugCount, critical, high } });
}

export async function handleExportRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? "GET";
  if (method !== "POST") return false;

  try {
    const runExport = matchPath("/api/runs/:id/export", pathname);
    if (runExport) {
      await exportRun(req, res, runExport.id, url);
      return true;
    }
    const jira = matchPath("/api/bugs/:id/jira", pathname);
    if (jira) {
      await bugToJira(req, res, jira.id);
      return true;
    }
    const slack = matchPath("/api/runs/:id/slack", pathname);
    if (slack) {
      await runToSlack(req, res, slack.id);
      return true;
    }
  } catch (err) {
    respondError(res, err);
    return true;
  }
  return false;
}
