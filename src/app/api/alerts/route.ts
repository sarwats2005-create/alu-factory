import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";
import { refreshAlerts } from "@/lib/alerts";

export const GET = handler(null, async () => {
  await refreshAlerts();
  const alerts = await prisma.alert.findMany({
    where: { isRead: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = await prisma.alert.count({ where: { isRead: false } });
  return ok({ alerts, unread });
});

export const PATCH = handler(null, async () => {
  await prisma.alert.updateMany({ where: { isRead: false }, data: { isRead: true } });
  return ok({ success: true });
});
