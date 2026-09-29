import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { beneficiaryDue, beneficiaryTotals } from "@/lib/balances";

export const GET = handler("beneficiaries", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const beneficiary = await prisma.beneficiary.findUnique({
    where: { id },
    include: {
      purchases: { orderBy: { txDate: "desc" } },
      payments: { orderBy: { payDate: "desc" } },
    },
  });
  if (!beneficiary) return fail("Beneficiary not found.", 404);

  const due = await beneficiaryDue(id);
  const totals = await beneficiaryTotals(id);
  return ok({ beneficiary, due: due.toFixed(2), totals });
});

export const PUT = handler("beneficiaries", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const fullName = String(body.fullName || "").trim();
  if (!fullName) return fail("Full name is required.", 400, "VALIDATION");

  const dup = await prisma.beneficiary.findFirst({
    where: { fullName, id: { not: id } },
  });
  if (dup) return fail("A beneficiary with this name already exists.", 409, "DUPLICATE");

  const beneficiary = await prisma.beneficiary.update({
    where: { id },
    data: {
      fullName,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
    },
  });

  await audit(user.id, "UPDATE", "BENEFICIARIES", id, { fullName });
  return ok({ beneficiary });
});

export const DELETE = handler("beneficiaries", async (req, user, ctx) => {
  const { id } = await ctx.params;
  const purchasesCount = await prisma.purchase.count({ where: { beneficiaryId: id } });
  if (purchasesCount > 0) {
    return fail(
      "This beneficiary has recorded purchases and cannot be deleted.",
      409,
      "HAS_TRANSACTIONS"
    );
  }
  await prisma.beneficiary.delete({ where: { id } });
  await audit(user.id, "DELETE", "BENEFICIARIES", id);
  return ok({ success: true });
});
