import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";

void prisma;

export const GET = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return failSafe();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));
  const action = url.searchParams.get("action") || "";
  const userId = url.searchParams.get("userId") || "";

  const where: any = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { fullName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return ok({ rows, total, page, pageSize });
});

function failSafe() {
  return ok({ rows: [], total: 0, page: 1, pageSize: 25, forbidden: true });
}
