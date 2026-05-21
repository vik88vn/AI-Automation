// Authentication routes: signup, login, refresh, me.
//
// Exposes a single dispatcher `handleAuthRoutes(req, res, url)` that returns
// true if it handled the request, false otherwise — letting server.ts fall
// through to the next route group.

import type { IncomingMessage, ServerResponse } from "node:http";
import { prisma } from "../db/client.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { issueAccessToken, issueRefreshToken, verifyToken } from "../auth/jwt.js";
import { requireAuth, AuthError } from "../auth/middleware.js";
import { sendJson, readJson, requireString, HttpError } from "../lib/http.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignupBody {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}
interface LoginBody {
  email?: string;
  password?: string;
}
interface RefreshBody {
  refreshToken?: string;
}

// Shape a user record for API responses (never leak the password hash).
function publicUser(u: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    createdAt: u.createdAt,
  };
}

async function signup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<SignupBody>(req);
  const email = requireString(body.email, "email").toLowerCase().trim();
  const password = requireString(body.password, "password");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Invalid email address");
  if (password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: typeof body.firstName === "string" ? body.firstName : null,
      lastName: typeof body.lastName === "string" ? body.lastName : null,
    },
  });

  const claims = { sub: user.id, email: user.email, role: user.role };
  sendJson(res, 201, {
    user: publicUser(user),
    accessToken: issueAccessToken(claims),
    refreshToken: issueRefreshToken(claims),
  });
}

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<LoginBody>(req);
  const email = requireString(body.email, "email").toLowerCase().trim();
  const password = requireString(body.password, "password");

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run verify to avoid leaking which emails exist via timing.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await verifyPassword(password, hash);
  if (!user || !ok) throw new HttpError(401, "Invalid email or password");

  const claims = { sub: user.id, email: user.email, role: user.role };
  sendJson(res, 200, {
    user: publicUser(user),
    accessToken: issueAccessToken(claims),
    refreshToken: issueRefreshToken(claims),
  });
}

async function refresh(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson<RefreshBody>(req);
  const token = requireString(body.refreshToken, "refreshToken");
  let payload;
  try {
    payload = verifyToken(token, "refresh");
  } catch (err) {
    throw new AuthError(401, `Invalid refresh token: ${err instanceof Error ? err.message : "unknown"}`);
  }
  // Confirm the user still exists (revoked/deleted accounts can't refresh).
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new AuthError(401, "User no longer exists");

  const claims = { sub: user.id, email: user.email, role: user.role };
  sendJson(res, 200, { accessToken: issueAccessToken(claims) });
}

async function me(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authed = requireAuth(req);
  const user = await prisma.user.findUnique({ where: { id: authed.id } });
  if (!user) throw new AuthError(401, "User no longer exists");
  sendJson(res, 200, { user: publicUser(user) });
}

// Dispatcher. Returns true if the route was handled.
export async function handleAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? "GET";

  const map: Array<[string, string, (req: IncomingMessage, res: ServerResponse) => Promise<void>]> = [
    ["POST", "/api/auth/signup", signup],
    ["POST", "/api/auth/login", login],
    ["POST", "/api/auth/refresh", refresh],
    ["GET", "/api/auth/me", me],
  ];

  for (const [m, p, handler] of map) {
    if (method === m && pathname === p) {
      try {
        await handler(req, res);
      } catch (err) {
        respondError(res, err);
      }
      return true;
    }
  }
  return false;
}

// Convert thrown errors into JSON responses with the right status code.
export function respondError(res: ServerResponse, err: unknown): void {
  if (err instanceof AuthError || err instanceof HttpError) {
    sendJson(res, err.status, { error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  // eslint-disable-next-line no-console
  console.error("[route error]", message);
  sendJson(res, 500, { error: "Internal server error" });
}
