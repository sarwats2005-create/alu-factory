import { prisma } from "@/lib/db";
import { ok, fail, handler, audit, PUBLIC } from "@/lib/api";
import { verifyPassword, createSession, canAccess, PAGES, type SessionUser } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const POST = handler(PUBLIC, async (req) => {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return fail("Email and password are required.", 400, "VALIDATION");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { permissions: true },
  });

  if (!user || !user.active) {
    // Same message for both cases to avoid account enumeration
    return fail("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return fail("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession(user.id);
  await audit(user.id, "LOGIN", "AUTH", user.id, { email: user.email });

  const permissions: Record<string, boolean> = {};
  for (const p of user.permissions) permissions[p.page] = p.allowed;
  if (user.role === "OWNER") {
    for (const pg of PAGES) permissions[pg] = true;
  }

  const session: SessionUser = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as "OWNER" | "USER",
    language: user.language,
    permissions,
  };

  return ok({ user: session });
});
