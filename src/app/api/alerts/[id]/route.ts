import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";

export const PATCH = handler(null, async (req, user, ctx) => {
  const { id } = await ctx.params;
  await prisma.alert.update({ where: { id }, data: { isRead: true } });
  return ok({ success: true });
});
