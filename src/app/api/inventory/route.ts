import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { D } from "@/lib/money";

export const GET = handler("inventory", async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  const where: any = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }];

  const s = await getSettings();

  const [items, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  const rows = items.map((item) => {
    const threshold = item.lowStockKg ? D(item.lowStockKg) : D(s.defaultLowStockKg);
    const available = D(item.available);
    const st = available.lte(0) ? "out" : available.lt(threshold) ? "low" : "in";
    return {
      ...item,
      status: st,
      threshold: threshold.toFixed(2),
    };
  });

  const filtered = status ? rows.filter((r) => r.status === status) : rows;

  return ok({ rows: filtered, total, page, pageSize });
});
