import { ok, fail, handler, audit } from "@/lib/api";
import { createBeneficiaryPayment, deleteBeneficiaryPayment } from "@/lib/transactions";

export const POST = handler("beneficiaries", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.amount || Number(body.amount) <= 0) {
    return fail("Amount must be greater than 0.", 400, "VALIDATION");
  }
  const payment = await createBeneficiaryPayment(user.id, id, {
    amount: body.amount,
    currency: body.currency === "IQD" ? "IQD" : "USD",
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    notes: body.notes,
    payDate: body.payDate,
  });
  await audit(user.id, "CREATE", "BENEFICIARIES", payment.id, { kind: "payment", amount: body.amount, beneficiaryId: id });
  return ok({ payment }, 201);
});

export const DELETE = handler("beneficiaries", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const paymentId = new URL(req.url).searchParams.get("paymentId");
  if (!paymentId) return fail("Payment id required.", 400);
  const p = await deleteBeneficiaryPayment(user.id, id, paymentId);
  await audit(user.id, "DELETE", "BENEFICIARIES", paymentId, { kind: "payment", reference: p.reference, amount: String(p.amount), currency: p.currency, beneficiaryId: id });
  return ok({ success: true });
});
