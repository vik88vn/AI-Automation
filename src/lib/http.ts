// Shared HTTP helpers for the native http server and its route modules.
//
// The server isn't Express, so these small utilities standardize JSON
// responses, body parsing, CORS, and path-param extraction across every
// route handler.

import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

// Read the raw request body as a UTF-8 string.
export async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      // Guard against unbounded bodies (1 MB cap for JSON APIs).
      if (size > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// Parse the request body as JSON. Throws HttpError(400) on malformed JSON.
export async function readJson<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

// CORS for the SaaS frontend: allows the methods and headers the API needs
// (Authorization for JWT, PATCH/DELETE for bug/member mutations).
export function setCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", process.env.CORS_ORIGIN ?? "*");
  res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  res.setHeader("access-control-max-age", "86400");
}

// Validate that a value is a non-empty string, else throw HttpError(400).
export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `Field "${field}" is required and must be a non-empty string`);
  }
  return value;
}

// Match a pathname against a template like "/projects/:id/members/:userId".
// Returns the extracted params object, or null if it doesn't match.
export function matchPath(
  pattern: string,
  pathname: string
): Record<string, string> | null {
  const pSeg = pattern.split("/").filter(Boolean);
  const aSeg = pathname.split("/").filter(Boolean);
  if (pSeg.length !== aSeg.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i += 1) {
    if (pSeg[i].startsWith(":")) {
      params[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i]);
    } else if (pSeg[i] !== aSeg[i]) {
      return null;
    }
  }
  return params;
}
