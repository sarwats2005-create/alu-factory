import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";

export const GET = handler(null, async () => {
  const types = await prisma.aluminumType.findMany({ orderBy: { name: "asc" } });
  return ok({ types });
});

export const POST = handler("settings", async (req, user) => {
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return fail("Name is required.", 400, "VALIDATION");
  const existing = await prisma.aluminumType.findUnique({ where: { name } });
  if (existing) return fail("This type already exists.", 409, "DUPLICATE");
  const t = await prisma.aluminumType.create({ data: { name } });
  await audit(user.id, "CREATE", "SETTINGS", t.id, { name });
  return ok({ type: t }, 201);
});

export const DELETE = handler("settings", async (req, user) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("id required", 400);
  await prisma.aluminumType.delete({ where: { id } });
  await audit(user.id, "DELETE", "SETTINGS", id);
  return ok({ success: true });
});
