import { prisma } from "@/lib/db";
import { ok, fail, handler, audit, PUBLIC } from "@/lib/api";
import { verifyPassword, createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export const POST = handler(PUBLIC, async (req) => {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();

  if (!email || !password || password.length < 8) {
    return fail("Email and a password of at least 8 characters are required.", 400, "VALIDATION");
  }

  const existingCount = await prisma.user.count();
  const isFirst = existingCount === 0;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return fail("An account with this email already exists.", 409, "DUPLICATE");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: fullName || email.split("@")[0],
      role: isFirst ? "OWNER" : "USER",
      active: isFirst, // additional accounts inactive until Owner activates
    },
  });

  await audit(user.id, "CREATE", "AUTH", user.id, { email, isFirst });

  if (!isFirst) {
    return ok({
      user: null,
      message: "Account created. It must be activated and given permissions by the Owner.",
    });
  }

  await createSession(user.id);
  return ok({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
});
