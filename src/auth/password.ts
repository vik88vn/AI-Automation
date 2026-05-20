// Password hashing helpers (bcrypt).
//
// bcryptjs is pure JS (no native bindings), so it deploys cleanly to any
// Node host without a compile step. Cost factor 12 is a sane 2026 default —
// ~250ms per hash, expensive enough to deter brute force.

import bcrypt from "bcryptjs";

const COST_FACTOR = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
