import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { createPurchase, updatePurchase, deletePurchase } from "@/lib/transactions";

export const GET = handler("beneficiaries", async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));
  const q = url.searchParams.get("q")?.trim() || "";
  const beneficiaryId = url.searchParams.get("beneficiaryId") || "";

  const where: any = {};
  if (q) {
    where.OR = [
      { productName: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
      { number: { contains: q, mode: "insensitive" } },
    ];
  }
  if (beneficiaryId) where.beneficiaryId = beneficiaryId;

  const [purchases, total] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: { txDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { beneficiary: { select: { fullName: true } } },
    }),
    prisma.purchase.count({ where }),
  ]);

  return ok({ purchases, total, page, pageSize });
});

export const POST = handler("beneficiaries", async (req, user) => {
  const body = await req.json();
  const purchase = await createPurchase(user.id, {
    beneficiaryId: body.beneficiaryId,
    productName: body.productName,
    sku: body.sku,
    aluminumType: body.aluminumType,
    weightKg: body.weightKg,
    unitPrice: body.unitPrice,
    currency: body.currency === "IQD" ? "IQD" : "USD",
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    cashPaid: body.cashPaid ?? 0,
    txDate: body.txDate,
    notes: body.notes,
  });
  await audit(user.id, "CREATE", "INVENTORY/PURCHASES", purchase.id, { number: purchase.number, total: String(purchase.totalPrice) });
  return ok({ purchase }, 201);
});

export const PUT = handler("beneficiaries", async (req, user) => {
  const body = await req.json();
  if (!body.id) return fail("Purchase id required.", 400);
  const purchase = await updatePurchase(user.id, body.id, {
    beneficiaryId: body.beneficiaryId,
    productName: body.productName,
    sku: body.sku,
    aluminumType: body.aluminumType,
    weightKg: body.weightKg,
    unitPrice: body.unitPrice,
    currency: body.currency === "IQD" ? "IQD" : "USD",
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    cashPaid: body.cashPaid ?? 0,
    txDate: body.txDate,
    notes: body.notes,
  });
  await audit(user.id, "UPDATE", "INVENTORY/PURCHASES", body.id, { number: purchase.number });
  return ok({ purchase });
});

export const DELETE = handler("beneficiaries", async (req, user) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("Purchase id required.", 400);
  const p = await deletePurchase(user.id, id);
  await audit(user.id, "DELETE", "INVENTORY/PURCHASES", id, { number: p.number });
  return ok({ success: true });
});
