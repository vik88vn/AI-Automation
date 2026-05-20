// Auth helpers for the native http server (src/agent/server.ts).
//
// The server isn't Express, so instead of `app.use(middleware)` we expose
// small functions the route handlers call explicitly:
//
//   const user = requireAuth(req);   // throws AuthError(401) if missing/invalid
//   if (!user) return;               // (when using tryAuth)
//
// requireAuth throws so handlers can early-return via a single catch; the
// server's top-level dispatcher converts AuthError into a JSON 401/403.

import type { IncomingMessage } from "node:http";
import { extractBearer, verifyToken, type JwtPayload } from "./jwt.js";

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthedUser {
  id: string;
  email: string;
  role: string;
}

// Verify the request's bearer token and return the user context.
// Throws AuthError(401) if the token is missing, malformed, or expired.
export function requireAuth(req: IncomingMessage): AuthedUser {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    throw new AuthError(401, "Missing Authorization bearer token");
  }
  let payload: JwtPayload;
  try {
    payload = verifyToken(token, "access");
  } catch (err) {
    throw new AuthError(401, `Invalid or expired token: ${err instanceof Error ? err.message : "unknown"}`);
  }
  return { id: payload.sub, email: payload.email, role: payload.role };
}

// Like requireAuth but returns null instead of throwing — for endpoints that
// behave differently for anonymous vs authenticated callers.
export function tryAuth(req: IncomingMessage): AuthedUser | null {
  try {
    return requireAuth(req);
  } catch {
    return null;
  }
}

// Role gate. Throws AuthError(403) if the user lacks the required role.
// ADMIN implicitly satisfies any role requirement.
export function requireRole(user: AuthedUser, role: "ADMIN" | "MEMBER" | "VIEWER"): void {
  if (user.role === "ADMIN") return;
  if (user.role !== role) {
    throw new AuthError(403, `Requires ${role} role`);
  }
}
