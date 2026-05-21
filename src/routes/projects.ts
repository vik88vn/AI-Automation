// Project routes: create, list, get, and share (add/remove members).
//
// Tenant isolation is enforced here: a user only sees projects they own or
// are a member of. Only the owner (or an ADMIN) can add/remove members.

import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "../db/client.js";
import { requireAuth, type AuthedUser } from "../auth/middleware.js";
import { sendJson, readJson, requireString, HttpError, matchPath } from "../lib/http.js";
import { respondError } from "./auth.js";

interface CreateProjectBody {
  name?: string;
  targetUrl?: string;
  description?: string;
}
interface AddMemberBody {
  email?: string;
  role?: "MEMBER" | "VIEWER";
}

// Load a project the user is allowed to see (owner or member), else throw.
// Returns the project plus whether the caller is the owner.
async function loadAccessibleProject(projectId: string, user: AuthedUser) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });
  if (!project) throw new HttpError(404, "Project not found");

  const isOwner = project.ownerId === user.id;
  const isMember = project.members.some((m) => m.userId === user.id);
  if (!isOwner && !isMember && user.role !== "ADMIN") {
    // 404 (not 403) so we don't reveal that the project exists.
    throw new HttpError(404, "Project not found");
  }
  return { project, isOwner: isOwner || user.role === "ADMIN" };
}

async function createProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = requireAuth(req);
  const body = await readJson<CreateProjectBody>(req);
  const name = requireString(body.name, "name");
  const targetUrl = requireString(body.targetUrl, "targetUrl");

  const project = await prisma.project.create({
    data: {
      name,
      targetUrl,
      description: typeof body.description === "string" ? body.description : null,
      ownerId: user.id,
    },
  });
  sendJson(res, 201, { project });
}

async function listProjects(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = requireAuth(req);
  // Owned projects + projects shared with the user.
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    include: {
      _count: { select: { runs: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  sendJson(res, 200, { projects });
}

async function getProject(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const user = requireAuth(req);
  const { project } = await loadAccessibleProject(id, user);
  // Include recent runs for the project detail view.
  const runs = await prisma.run.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      url: true,
      status: true,
      startedAt: true,
      endedAt: true,
      testsTotal: true,
      testsPassed: true,
      testsFailed: true,
    },
  });
  sendJson(res, 200, { project, runs });
}

async function addMember(req: IncomingMessage, res: ServerResponse, projectId: string): Promise<void> {
  const user = requireAuth(req);
  const { isOwner } = await loadAccessibleProject(projectId, user);
  if (!isOwner) throw new HttpError(403, "Only the project owner can add members");

  const body = await readJson<AddMemberBody>(req);
  const email = requireString(body.email, "email").toLowerCase().trim();
  const role = body.role === "MEMBER" ? "MEMBER" : "VIEWER";

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) throw new HttpError(404, "No user with that email — they must sign up first");
  if (invitee.id === user.id) throw new HttpError(400, "You already own this project");

  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId: invitee.id } },
    update: { role },
    create: { projectId, userId: invitee.id, role },
  });
  sendJson(res, 201, {
    member: { id: member.id, userId: invitee.id, email: invitee.email, role: member.role },
  });
}

async function removeMember(
  req: IncomingMessage,
  res: ServerResponse,
  projectId: string,
  userId: string
): Promise<void> {
  const user = requireAuth(req);
  const { isOwner } = await loadAccessibleProject(projectId, user);
  if (!isOwner) throw new HttpError(403, "Only the project owner can remove members");

  await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  sendJson(res, 200, { ok: true });
}

export async function handleProjectRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? "GET";

  try {
    if (method === "POST" && pathname === "/api/projects") {
      await createProject(req, res);
      return true;
    }
    if (method === "GET" && pathname === "/api/projects") {
      await listProjects(req, res);
      return true;
    }

    const memberWithUser = matchPath("/api/projects/:id/members/:userId", pathname);
    if (method === "DELETE" && memberWithUser) {
      await removeMember(req, res, memberWithUser.id, memberWithUser.userId);
      return true;
    }

    const members = matchPath("/api/projects/:id/members", pathname);
    if (method === "POST" && members) {
      await addMember(req, res, members.id);
      return true;
    }

    const single = matchPath("/api/projects/:id", pathname);
    if (method === "GET" && single) {
      await getProject(req, res, single.id);
      return true;
    }
  } catch (err) {
    respondError(res, err);
    return true;
  }
  return false;
}
