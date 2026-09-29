import { ok, fail, handler } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = handler(null, async () => {
  const user = await getSessionUser();
  return ok({ user });
});

export const PATCH = handler(null, async (req, user) => {
  const body = await req.json();
  const language = body.language === "ku" ? "ku" : "en";
  await prisma.user.update({ where: { id: user.id }, data: { language } });
  return ok({ success: true, language });
});

async function getSessionUser() {
  const { getSession } = await import("@/lib/auth");
  return getSession();
}
