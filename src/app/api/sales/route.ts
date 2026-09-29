import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { createSale, updateSale, deleteSale } from "@/lib/transactions";

export const GET = handler("pos", async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));
  const q = url.searchParams.get("q")?.trim() || "";
  const customerId = url.searchParams.get("customerId") || "";

  const where: any = {};
  if (q) where.invoiceNo = { contains: q, mode: "insensitive" };
  if (customerId) where.customerId = customerId;

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { saleDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { fullName: true } },
        lineItems: { include: { item: { select: { name: true, sku: true } } } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return ok({ sales, total, page, pageSize });
});

export const POST = handler("pos", async (req, user) => {
  const body = await req.json();
  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return fail("At least one line item is required.", 400, "VALIDATION");
  }
  const sale = await createSale(user.id, {
    customerId: body.customerId,
    currency: body.currency === "IQD" ? "IQD" : "USD",
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    cashPaid: body.cashPaid ?? 0,
    saleDate: body.saleDate,
    notes: body.notes,
    lineItems: body.lineItems,
  });
  await audit(user.id, "CREATE", "POS", sale.id, { invoiceNo: sale.invoiceNo, total: String(sale.totalAmount) });
  return ok({ sale }, 201);
});

export const PUT = handler("pos", async (req, user) => {
  const body = await req.json();
  if (!body.id) return fail("Sale id required.", 400);

  // 24-hour edit window, measured from invoice creation (not the backdatable
  // sale date). Mirrors the UI rule that hides the Edit button.
  const existing = await prisma.sale.findUnique({ where: { id: body.id }, select: { createdAt: true } });
  if (!existing) return fail("Sale not found.", 404);
  const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) {
    return fail("The 24-hour edit window for this invoice has expired.", 403, "EDIT_WINDOW_EXPIRED");
  }

  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return fail("At least one line item is required.", 400, "VALIDATION");
  }
  const sale = await updateSale(user.id, body.id, {
    customerId: body.customerId,
    currency: body.currency === "IQD" ? "IQD" : "USD",
    vaultCurrency: body.vaultCurrency === "IQD" ? "IQD" : "USD",
    cashPaid: body.cashPaid ?? 0,
    saleDate: body.saleDate,
    notes: body.notes,
    lineItems: body.lineItems,
  });
  await audit(user.id, "UPDATE", "POS", body.id, { invoiceNo: sale.invoiceNo });
  return ok({ sale });
});

export const DELETE = handler("pos", async (req, user) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("Sale id required.", 400);
  const s = await deleteSale(user.id, id);
  await audit(user.id, "DELETE", "POS", id, { invoiceNo: s.invoiceNo });
  return ok({ success: true });
});
