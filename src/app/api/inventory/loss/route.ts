import { ok, fail, handler, audit } from "@/lib/api";
import { applyLoss } from "@/lib/transactions";

export const POST = handler("inventory", async (req, user) => {
  const body = await req.json();
  const mode = body.mode === "MANUAL" ? "MANUAL" : "PERCENT";
  if (mode === "PERCENT") {
    const pct = Number(body.lossPct);
    if (!pct || pct <= 0 || pct >= 100) {
      return fail("Loss percentage must be between 0 and 100.", 400, "VALIDATION");
    }
  } else {
    const remaining = Number(body.remainingKg);
    if (isNaN(remaining) || remaining < 0) {
      return fail("Remaining weight must be 0 or more.", 400, "VALIDATION");
    }
  }
  const ev = await applyLoss(user.id, {
    itemId: body.itemId,
    mode,
    lossPct: body.lossPct,
    remainingKg: body.remainingKg,
    notes: body.notes,
    processedAt: body.processedAt,
  });
  await audit(user.id, "UPDATE", "INVENTORY", body.itemId, {
    kind: "loss",
    lossKg: String(ev.lossKg),
    lossPct: String(ev.lossPct),
  });
  return ok({ event: ev }, 201);
});
