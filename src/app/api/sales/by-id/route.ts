import { prisma } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";

export const GET = handler("pos", async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("id required", 400);
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      lineItems: { include: { item: true } },
    },
  });
  if (!sale) return fail("Sale not found.", 404);
  return ok({ sale });
});
