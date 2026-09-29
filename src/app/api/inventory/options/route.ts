import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";

export const GET = handler(null, async () => {
  const items = await prisma.inventoryItem.findMany({
    select: { sku: true, name: true, available: true },
    orderBy: { name: "asc" },
  });
  return ok({ options: items });
});
