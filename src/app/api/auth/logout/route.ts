import { ok, handler, audit } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const POST = handler(null, async (req, user) => {
  await destroySession();
  await audit(user.id, "LOGOUT", "AUTH", user.id);
  return ok({ success: true });
});
