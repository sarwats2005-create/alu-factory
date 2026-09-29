import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { customerDue, customerTotals } from "@/lib/balances";

export const GET = handler("customers", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: {
        orderBy: { saleDate: "desc" },
        include: { lineItems: { include: { item: true } } },
      },
      payments: { orderBy: { payDate: "desc" } },
    },
  });
  if (!customer) return fail("Customer not found.", 404);

  const due = await customerDue(id);
  const totals = await customerTotals(id);
  return ok({ customer, due: due.toFixed(2), totals });
});

export const PUT = handler("customers", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const fullName = String(body.fullName || "").trim();
  if (!fullName) return fail("Full name is required.", 400, "VALIDATION");

  const dup = await prisma.customer.findFirst({
    where: { fullName, id: { not: id } },
  });
  if (dup) return fail("A customer with this name already exists.", 409, "DUPLICATE");

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      fullName,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      photo: body.photo ?? null,
    },
  });

  await audit(user.id, "UPDATE", "CUSTOMERS", id, { fullName });
  return ok({ customer });
});

export const DELETE = handler("customers", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const salesCount = await prisma.sale.count({ where: { customerId: id } });
  if (salesCount > 0) {
    return fail(
      "This customer has recorded sales and cannot be deleted. Consider keeping them for audit purposes.",
      409,
      "HAS_TRANSACTIONS"
    );
  }
  await prisma.customer.delete({ where: { id } });
  await audit(user.id, "DELETE", "CUSTOMERS", id);
  return ok({ success: true });
});
