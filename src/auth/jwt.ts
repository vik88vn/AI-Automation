// JWT issue/verify helpers.
//
// Uses HS256 with a shared secret (JWT_SECRET). For a single backend service
// this is simpler than RS256 keypairs and equally secure as long as the secret
// is strong (generate with `openssl rand -hex 32`) and never shipped to the
// client. Access tokens are short-lived; refresh tokens are longer-lived and
// carry a `type` claim so an access token can't be used to refresh.

import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  type?: "access" | "refresh";
}

const ACCESS_TTL = "1h";
const REFRESH_TTL = "30d";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set a strong secret (openssl rand -hex 32)."
    );
  }
  return s;
}

export function issueAccessToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, secret(), { expiresIn: ACCESS_TTL });
}

export function issueRefreshToken(payload: Omit<JwtPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, secret(), { expiresIn: REFRESH_TTL });
}

// Verify and decode a token. Throws if invalid/expired. Pass `expectType` to
// reject a token of the wrong kind (e.g. using an access token to refresh).
export function verifyToken(token: string, expectType?: "access" | "refresh"): JwtPayload {
  const decoded = jwt.verify(token, secret()) as JwtPayload;
  if (expectType && decoded.type !== expectType) {
    throw new Error(`Expected ${expectType} token but got ${decoded.type ?? "untyped"}`);
  }
  return decoded;
}

// Extract a bearer token from an Authorization header value, or null.
export function extractBearer(header: string | undefined | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
