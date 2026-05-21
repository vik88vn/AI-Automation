// Unit tests for pure backend logic. Zero framework dependency — uses Node's
// built-in node:test + node:assert. Run: npx tsx --test test/unit.test.mts
// (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";

import { matchPath, requireString, HttpError } from "../src/lib/http.js";
import {
  issueAccessToken,
  issueRefreshToken,
  verifyToken,
  extractBearer,
} from "../src/auth/jwt.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { bugsToCsv, buildHtmlReport, type ExportBug } from "../src/services/export.js";
import { rateLimit, __resetRateLimits } from "../src/lib/rateLimit.js";
import { HttpError as HttpErr } from "../src/lib/http.js";

process.env.JWT_SECRET ??= "unit-test-secret-0123456789abcdef";

// ── matchPath ──────────────────────────────────────────────────────────────
test("matchPath extracts single param", () => {
  assert.deepEqual(matchPath("/api/projects/:id", "/api/projects/abc"), { id: "abc" });
});
test("matchPath extracts multiple params", () => {
  assert.deepEqual(matchPath("/api/projects/:id/members/:userId", "/api/projects/p1/members/u2"), {
    id: "p1",
    userId: "u2",
  });
});
test("matchPath returns null on segment-count mismatch", () => {
  assert.equal(matchPath("/api/projects/:id", "/api/projects/abc/extra"), null);
});
test("matchPath returns null on literal mismatch", () => {
  assert.equal(matchPath("/api/projects/:id", "/api/runs/abc"), null);
});
test("matchPath decodes URI components", () => {
  assert.deepEqual(matchPath("/api/users/:email", "/api/users/a%40b.com"), { email: "a@b.com" });
});

// ── requireString ────────────────────────────────────────────────────────
test("requireString passes valid string", () => {
  assert.equal(requireString("hello", "field"), "hello");
});
test("requireString throws HttpError(400) on empty", () => {
  assert.throws(() => requireString("", "name"), (e) => e instanceof HttpError && e.status === 400);
});
test("requireString throws on non-string", () => {
  assert.throws(() => requireString(42, "n"), (e) => e instanceof HttpError);
});

// ── JWT ────────────────────────────────────────────────────────────────────
test("JWT round-trips claims", () => {
  const t = issueAccessToken({ sub: "u1", email: "a@b.com", role: "MEMBER" });
  const d = verifyToken(t, "access");
  assert.equal(d.sub, "u1");
  assert.equal(d.email, "a@b.com");
  assert.equal(d.type, "access");
});
test("JWT rejects wrong token type", () => {
  const refresh = issueRefreshToken({ sub: "u1", email: "a@b.com", role: "MEMBER" });
  assert.throws(() => verifyToken(refresh, "access"));
});
test("JWT rejects tampered token", () => {
  assert.throws(() => verifyToken("a.b.c"));
});
test("extractBearer parses header", () => {
  assert.equal(extractBearer("Bearer xyz"), "xyz");
  assert.equal(extractBearer("bearer xyz"), "xyz");
  assert.equal(extractBearer(null), null);
  assert.equal(extractBearer("Basic xyz"), null);
});

// ── Password hashing ───────────────────────────────────────────────────────
test("bcrypt verifies correct password and rejects wrong", async () => {
  const hash = await hashPassword("hunter2");
  assert.ok(hash.startsWith("$2"));
  assert.equal(await verifyPassword("hunter2", hash), true);
  assert.equal(await verifyPassword("nope", hash), false);
});

// ── CSV export ───────────────────────────────────────────────────────────
const sampleBugs: ExportBug[] = [
  {
    id: "b1",
    title: "Plain title",
    severity: "HIGH",
    type: "SECURITY",
    status: "OPEN",
    url: "http://x/y",
    assignedTo: { email: "dev@x.com" },
    createdAt: "2026-05-20T00:00:00.000Z",
  },
  {
    id: "b2",
    title: 'Title, with "comma" and quote',
    severity: "LOW",
    type: "SEO",
    status: "FIXED",
    url: "http://x/z",
    assignedTo: null,
    createdAt: "2026-05-20T00:00:00.000Z",
  },
];

test("bugsToCsv has header + one row per bug", () => {
  const csv = bugsToCsv(sampleBugs);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3); // header + 2
  assert.ok(lines[0].startsWith("id,title,severity"));
});
test("bugsToCsv escapes commas and quotes per RFC4180", () => {
  const csv = bugsToCsv(sampleBugs);
  // The tricky title must be wrapped in quotes with doubled inner quotes.
  assert.ok(csv.includes('"Title, with ""comma"" and quote"'));
});
test("bugsToCsv handles null assignee", () => {
  const csv = bugsToCsv([sampleBugs[1]]);
  assert.ok(csv.split("\r\n")[1].includes(",,")); // empty assignedTo field
});

// ── HTML report ────────────────────────────────────────────────────────────
test("buildHtmlReport includes counts and escapes HTML", () => {
  const html = buildHtmlReport(
    { id: "r1", url: "http://x", status: "COMPLETED", startedAt: "2026-05-20", testsTotal: 5, testsPassed: 4, testsFailed: 1 },
    [{ ...sampleBugs[0], title: "<script>alert(1)</script>" }],
    "My Project"
  );
  assert.ok(html.includes("My Project"));
  assert.ok(html.includes("&lt;script&gt;")); // XSS-safe escaping
  assert.ok(!html.includes("<script>alert(1)</script>"));
});
test("buildHtmlReport handles zero bugs", () => {
  const html = buildHtmlReport(
    { id: "r1", url: "http://x", status: "COMPLETED", startedAt: "2026-05-20", testsTotal: 3, testsPassed: 3, testsFailed: 0 },
    [],
    "Empty"
  );
  assert.ok(html.includes("No bugs"));
});

// ── Security hardening ─────────────────────────────────────────────────────
test("bugsToCsv neutralizes formula injection", () => {
  const evil: ExportBug = {
    id: "b3",
    title: "=cmd|'/c calc'!A1",
    severity: "HIGH",
    type: "SECURITY",
    status: "OPEN",
    url: "http://x",
    assignedTo: null,
    createdAt: "2026-05-20T00:00:00.000Z",
  };
  const csv = bugsToCsv([evil]);
  // The "=" cell must be prefixed with a single quote (and then quoted because
  // it contains a comma-like char set). Either way the raw "=cmd" must not
  // appear at a cell boundary unescaped.
  assert.ok(csv.includes("'=cmd"), "formula should be prefixed with single quote");
  assert.ok(!/(^|,)=cmd/m.test(csv), "no bare =cmd at a cell boundary");
});

test("rateLimit allows up to limit then throws 429", () => {
  __resetRateLimits();
  const key = "test:key";
  for (let i = 0; i < 5; i += 1) rateLimit(key, 5, 60_000); // 5 allowed
  assert.throws(
    () => rateLimit(key, 5, 60_000), // 6th rejected
    (e) => e instanceof HttpErr && e.status === 429
  );
});

test("rateLimit isolates distinct keys", () => {
  __resetRateLimits();
  rateLimit("a", 1, 60_000);
  // different key still has its own budget
  assert.doesNotThrow(() => rateLimit("b", 1, 60_000));
  assert.throws(() => rateLimit("a", 1, 60_000), (e) => e instanceof HttpErr && e.status === 429);
});
