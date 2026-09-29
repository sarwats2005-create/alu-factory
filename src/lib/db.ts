import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * One PrismaClient per process. On Cloudflare Workers (OpenNext), the
 * Hyperdrive binding replaces DATABASE_URL with its pooled connection
 * string — set via `[hyperdrive_binding].connectionString` in the worker
 * entrypoint, or leave DATABASE_URL pointed at Neon and Hyperdrive is used
 * only when deployed with the binding wired (see wrangler.jsonc).
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
