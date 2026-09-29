import { prisma } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";

export const GET = handler("inventory", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      movements: { orderBy: { movedAt: "desc" }, take: 200 },
      lossEvents: { orderBy: { processedAt: "desc" } },
      saleLines: { include: { sale: { select: { invoiceNo: true, saleDate: true } } } },
    },
  });
  if (!item) return fail("Item not found.", 404);
  return ok({ item });
});

export const PUT = handler("inventory", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: any = {};
  if (body.lowStockKg !== undefined) {
    data.lowStockKg = body.lowStockKg === null || body.lowStockKg === "" ? null : Number(body.lowStockKg);
  }
  const item = await prisma.inventoryItem.update({ where: { id }, data });
  return ok({ item });
});
