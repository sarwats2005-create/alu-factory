import { ok, fail, handler, audit } from "@/lib/api";
import { createVaultOp, deleteVaultOp } from "@/lib/transactions";

export const POST = handler("vault", async (req, user) => {
  const body = await req.json();
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return fail("Amount must be greater than 0.", 400, "VALIDATION");
  if (!body.label || !String(body.label).trim()) return fail("A source/reason label is required.", 400, "VALIDATION");

  const op = await createVaultOp(user.id, {
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    opType: body.opType === "WITHDRAW" ? "WITHDRAW" : "DEPOSIT",
    amount,
    label: body.label,
    notes: body.notes,
    opDate: body.opDate,
  });
  await audit(user.id, "CREATE", "VAULT", op.id, { opType: op.opType, amount, vault: op.vaultCurrency });
  return ok({ op }, 201);
});

export const DELETE = handler("vault", async (req, user) => {
  const url = new URL(req.url);
  const opId = url.searchParams.get("id");
  if (!opId) return fail("Operation id required.", 400);
  const op = await deleteVaultOp(user.id, opId);
  await audit(user.id, "DELETE", "VAULT", opId, { opType: op.opType, amount: String(op.amount) });
  return ok({ success: true });
});
