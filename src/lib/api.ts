import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, canAccess, type Page, type SessionUser } from "./auth";
import { prisma } from "./db";

export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 400, code = "APP_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(message: string, statusCode = 400, code = "APP_ERROR") {
  return NextResponse.json({ error: message, code }, { status: statusCode });
}

/** Sentinel for public (unauthenticated) routes such as login/signup. */
export const PUBLIC = Symbol("public");

/** Wrap a route handler: auth + page permission + unified error handling. */
export function handler(page: Page | typeof PUBLIC | null, fn: (req: Request, user: SessionUser, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any) => {
    try {
      const user = await getSession();
      if (page !== PUBLIC) {
        if (!user) return fail("Session expired. Please log in again.", 401, "UNAUTHENTICATED");
        if (page && !canAccess(user, page))
          return fail("You do not have permission to access this resource.", 403, "FORBIDDEN");
      }
      return await fn(req, user as SessionUser, ctx);
    } catch (err: any) {
      if (err instanceof AppError) {
        return fail(err.message, err.statusCode, err.code);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return fail("A record with this value already exists.", 409, "DUPLICATE");
        }
        if (err.code === "P2025") {
          return fail("Record not found.", 404, "NOT_FOUND");
        }
      }
      console.error(`[API] ${new Date().toISOString()}`, err);
      return fail("Transaction could not be completed. Please try again.", 500, "INTERNAL");
    }
  };
}

export async function audit(
  userId: string,
  action: string,
  module: string,
  recordRef?: string,
  details?: unknown
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        module,
        recordRef: recordRef ?? null,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (e) {
    console.error("[AUDIT] failed to write audit log", e);
  }
}
