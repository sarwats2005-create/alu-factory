import { prisma } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";

export const GET = handler("beneficiaries", async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("id required", 400);
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: { beneficiary: { select: { fullName: true } } },
  });
  if (!purchase) return fail("Purchase not found.", 404);
  return ok({ purchase });
});
