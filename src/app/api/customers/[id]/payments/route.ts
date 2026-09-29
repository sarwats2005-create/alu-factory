import { ok, fail, handler, audit } from "@/lib/api";
import { createCustomerPayment } from "@/lib/transactions";

export const POST = handler("customers", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  if (!body.amount || Number(body.amount) <= 0) {
    return fail("Amount must be greater than 0.", 400, "VALIDATION");
  }
  const payment = await createCustomerPayment(user.id, id, {
    amount: body.amount,
    currency: body.currency === "IQD" ? "IQD" : "USD",
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    notes: body.notes,
    payDate: body.payDate,
  });
  await audit(user.id, "CREATE", "CUSTOMERS", payment.id, { kind: "payment", amount: body.amount, customerId: id });
  return ok({ payment }, 201);
});
