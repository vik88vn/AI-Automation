// Bug routes: update status/assignment, comments, and list-by-run.
//
// Access control flows through the bug's run → project: a caller may touch a
// bug only if they own or belong to that project. Assignees must themselves
// be members (or the owner) of the project.

import type { IncomingMessage, ServerResponse } from "node:http";
import { BugStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedUser } from "../auth/middleware.js";
import { sendJson, readJson, requireString, HttpError, matchPath } from "../lib/http.js";
import { respondError } from "./auth.js";

interface PatchBugBody {
  status?: string;
  assignedToId?: string | null;
}
interface CommentBody {
  text?: string;
}

const VALID_STATUSES = new Set<string>(Object.values(BugStatus));

// Project-access predicate reused across bug/run lookups.
function accessFilter(user: AuthedUser) {
  if (user.role === "ADMIN") return {};
  return {
    OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
  };
}

// Load a bug the caller can access (via run → project), else 404.
async function loadAccessibleBug(bugId: string, user: AuthedUser) {
  const bug = await prisma.bug.findUnique({
    where: { id: bugId },
    include: { run: { include: { project: { include: { members: true } } } } },
  });
  if (!bug) throw new HttpError(404, "Bug not found");
  const project = bug.run.project;
  const allowed =
    user.role === "ADMIN" ||
    project.ownerId === user.id ||
    project.members.some((m) => m.userId === user.id);
  if (!allowed) throw new HttpError(404, "Bug not found");
  return bug;
}

async function patchBug(req: IncomingMessage, res: ServerResponse, bugId: string): Promise<void> {
  const user = requireAuth(req);
  const bug = await loadAccessibleBug(bugId, user);
  const body = await readJson<PatchBugBody>(req);

  const data: { status?: BugStatus; assignedToId?: string | null } = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      throw new HttpError(400, `Invalid status. Allowed: ${[...VALID_STATUSES].join(", ")}`);
    }
    data.status = body.status as BugStatus;
  }

  if (body.assignedToId !== undefined) {
    if (body.assignedToId === null) {
      data.assignedToId = null;
    } else {
      // Assignee must be the project owner or a member.
      const project = bug.run.project as unknown as {
        ownerId: string;
        members: Array<{ userId: string }>;
      };
      const isProjectPerson =
        project.ownerId === body.assignedToId ||
        project.members.some((m) => m.userId === body.assignedToId);
      if (!isProjectPerson) {
        throw new HttpError(400, "Assignee must be a member of the project");
      }
      data.assignedToId = body.assignedToId;
      // Auto-advance OPEN → ASSIGNED when assigning, unless caller set a status.
      if (data.status === undefined && bug.status === "OPEN") {
        data.status = "ASSIGNED";
      }
    }
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, "Nothing to update (provide status and/or assignedToId)");
  }

  const updated = await prisma.bug.update({ where: { id: bugId }, data });
  sendJson(res, 200, { bug: updated });
}

async function addComment(req: IncomingMessage, res: ServerResponse, bugId: string): Promise<void> {
  const user = requireAuth(req);
  await loadAccessibleBug(bugId, user);
  const body = await readJson<CommentBody>(req);
  const text = requireString(body.text, "text");

  const comment = await prisma.bugComment.create({
    data: { bugId, authorId: user.id, text },
    include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });
  sendJson(res, 201, { comment });
}

async function listComments(req: IncomingMessage, res: ServerResponse, bugId: string): Promise<void> {
  const user = requireAuth(req);
  await loadAccessibleBug(bugId, user);
  const comments = await prisma.bugComment.findMany({
    where: { bugId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } },
  });
  sendJson(res, 200, { comments });
}

async function listRunBugs(req: IncomingMessage, res: ServerResponse, runId: string, url: URL): Promise<void> {
  const user = requireAuth(req);
  // Verify the run belongs to a project the caller can access.
  const run = await prisma.run.findFirst({
    where: { id: runId, project: accessFilter(user) },
  });
  if (!run) throw new HttpError(404, "Run not found");

  const where: Record<string, unknown> = { runId };
  const status = url.searchParams.get("filter") || url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const type = url.searchParams.get("type");
  if (status && VALID_STATUSES.has(status)) where.status = status;
  if (severity) where.severity = severity.toUpperCase();
  if (type) where.type = type.toUpperCase();

  const bugs = await prisma.bug.findMany({
    where,
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    include: {
      assignedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
      _count: { select: { comments: true } },
    },
  });
  sendJson(res, 200, { bugs });
}

export async function handleBugRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? "GET";

  try {
    const comments = matchPath("/api/bugs/:id/comments", pathname);
    if (comments && method === "POST") {
      await addComment(req, res, comments.id);
      return true;
    }
    if (comments && method === "GET") {
      await listComments(req, res, comments.id);
      return true;
    }

    const single = matchPath("/api/bugs/:id", pathname);
    if (single && method === "PATCH") {
      await patchBug(req, res, single.id);
      return true;
    }

    const runBugs = matchPath("/api/runs/:id/bugs", pathname);
    if (runBugs && method === "GET") {
      await listRunBugs(req, res, runBugs.id, url);
      return true;
    }
  } catch (err) {
    respondError(res, err);
    return true;
  }
  return false;
}
