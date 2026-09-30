import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { hashPassword, PAGES } from "@/lib/auth";
import bcrypt from "bcryptjs";

export const GET = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  const users = await prisma.user.findMany({
    include: { permissions: true },
    orderBy: { createdAt: "asc" },
  });
  return ok({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      active: u.active,
      lastLoginAt: u.lastLoginAt,
      permissions: Object.fromEntries(u.permissions.map((p) => [p.page, p.allowed])),
    })),
  });
});

export const POST = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();

  if (!email || !fullName) return fail("Name and email are required.", 400, "VALIDATION");
  if (password.length < 8) return fail("Password must be at least 8 characters.", 400, "VALIDATION");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("A user with this email already exists.", 409, "DUPLICATE");

  const newUser = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await hashPassword(password),
      role: "USER",
      active: true,
      permissions: {
        create: (PAGES as readonly string[]).map((page) => ({
          page,
          allowed: Array.isArray(body.permissions) ? body.permissions.includes(page) : false,
        })),
      },
    },
  });

  await audit(user.id, "PERMISSION_CHANGE", "USERS", newUser.id, { created: email, permissions: body.permissions });
  return ok({ user: { id: newUser.id, email: newUser.email } }, 201);
});

export const PUT = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  const body = await req.json();
  const id = body.id;
  if (!id) return fail("User id required.", 400);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail("User not found.", 404);
  if (target.role === "OWNER" && body.active === false) {
    return fail("Owner account cannot be deactivated.", 400, "OWNER_PROTECTED");
  }

  const data: any = {};
  if (body.fullName) data.fullName = String(body.fullName).trim();
  if (body.password) {
    if (String(body.password).length < 8) return fail("Password must be at least 8 characters.", 400);
    data.passwordHash = await bcrypt.hash(String(body.password), 12);
  }
  if (body.active !== undefined) data.active = !!body.active;

  if (Array.isArray(body.permissions)) {
    for (const page of PAGES) {
      const allowed = body.permissions.includes(page);
      await prisma.userPermission.upsert({
        where: { userId_page: { userId: id, page } },
        update: { allowed },
        create: { userId: id, page, allowed },
      });
    }
    await audit(user.id, "PERMISSION_CHANGE", "USERS", id, { permissions: body.permissions });
  }

  await prisma.user.update({ where: { id }, data });
  await audit(user.id, "UPDATE", "USERS", id, { fields: Object.keys(data) });
  return ok({ success: true });
});

export const DELETE = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  // Single delete via ?id=…, bulk delete via JSON body { ids: [...] }.
  const url = new URL(req.url);
  const single = url.searchParams.get("id");
  let ids: string[] = single ? [single] : [];
  if (!single) {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.ids)) ids = body.ids.map(String).filter(Boolean);
  }
  ids = [...new Set(ids)];
  if (ids.length === 0) return fail("User id required.", 400);
  if (ids.includes(user.id)) return fail("You cannot delete your own account.", 400, "SELF_PROTECTED");

  const targets = await prisma.user.findMany({ where: { id: { in: ids } } });
  if (targets.length !== ids.length) return fail("User not found.", 404);
  if (targets.some((t) => t.role === "OWNER")) {
    return fail("Owner account cannot be deleted.", 400, "OWNER_PROTECTED");
  }

  // Remove the users entirely: their audit entries and exchange-rate log rows
  // reference them without cascade, so clear those first. Permissions cascade.
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await tx.exchangeRateLog.deleteMany({ where: { changedById: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });

  for (const t of targets) {
    await audit(user.id, "DELETE", "USERS", t.id, { email: t.email, fullName: t.fullName });
  }
  return ok({ success: true, deleted: targets.length });
});
