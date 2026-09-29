import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";

export const GET = handler("settings", async () => {
  const rows = await prisma.exchangeRateLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { changedBy: { select: { fullName: true } } },
  });
  return ok({ rows });
});
