// Prisma client singleton.
//
// In dev, tsx/hot-reload can re-evaluate this module many times; without the
// global cache we'd open a new connection pool on every reload and exhaust
// Postgres connections. Caching on globalThis keeps a single client alive
// across reloads. In production it's a plain module-level singleton.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
