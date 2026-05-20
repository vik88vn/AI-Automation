// Runtime smoke test for the Week 2 auth layer (no database required).
// Run: JWT_SECRET=... npx tsx scripts/verify-auth.mts

import { issueAccessToken, issueRefreshToken, verifyToken, extractBearer } from "../src/auth/jwt.js";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

const results: Array<[string, boolean]> = [];

const access = issueAccessToken({ sub: "u1", email: "a@b.com", role: "MEMBER" });
const decoded = verifyToken(access, "access");
results.push(["JWT access issue/verify", decoded.sub === "u1" && decoded.email === "a@b.com"]);

const bearer = extractBearer("Bearer " + access);
results.push(["extractBearer parses header", bearer === access]);

let rejectedWrongType = false;
try {
  verifyToken(access, "refresh");
} catch {
  rejectedWrongType = true;
}
results.push(["rejects access token used as refresh", rejectedWrongType]);

const refresh = issueRefreshToken({ sub: "u1", email: "a@b.com", role: "MEMBER" });
results.push(["refresh token verifies as refresh", verifyToken(refresh, "refresh").type === "refresh"]);

let rejectedGarbage = false;
try {
  verifyToken("not.a.jwt");
} catch {
  rejectedGarbage = true;
}
results.push(["rejects garbage token", rejectedGarbage]);

const hash = await hashPassword("hunter2");
const good = await verifyPassword("hunter2", hash);
const bad = await verifyPassword("wrong", hash);
results.push(["bcrypt hash/verify (correct + wrong)", good && !bad]);
results.push(["bcrypt produces salted hash", hash.startsWith("$2") && hash.length >= 50]);

let allPass = true;
for (const [label, pass] of results) {
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) allPass = false;
}
console.log(`\n${results.filter(([, p]) => p).length}/${results.length} auth checks passed`);
process.exit(allPass ? 0 : 1);
