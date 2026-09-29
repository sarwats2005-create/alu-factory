import { prisma } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";
import { D, startOfMonth } from "@/lib/money";

function dateRange(url: URL) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const where: any = {};
  if (from || to) {
    where.gte = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    where.lte = to ? new Date(`${to}T23:59:59.999Z`) : undefined;
    if (!from) delete where.gte;
    if (!to) delete where.lte;
  }
  return where;
}

export const GET = handler("reports", async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "pnl";

  switch (type) {
    case "pnl": {
      const dw = dateRange(url);
      const [sales, purchases] = await Promise.all([
        prisma.sale.aggregate({ where: { saleDate: dw }, _sum: { totalAmount: true, cogs: true, cashPaid: true, dueAmount: true } }),
        prisma.purchase.aggregate({ where: { txDate: dw }, _sum: { totalPrice: true, cashPaid: true, dueAmount: true } }),
      ]);
      const revenue = D(sales._sum.totalAmount ?? 0);
      const cogs = D(sales._sum.cogs ?? 0);
      return ok({
        type,
        revenue: revenue.toFixed(2),
        cogs: cogs.toFixed(2),
        grossProfit: revenue.minus(cogs).toFixed(2),
        purchaseTotal: D(purchases._sum.totalPrice ?? 0).toFixed(2),
        purchaseDue: D(purchases._sum.dueAmount ?? 0).toFixed(2),
        customerDue: D(sales._sum.dueAmount ?? 0).toFixed(2),
      });
    }

    case "sales": {
      const dw = dateRange(url);
      const customerId = url.searchParams.get("customerId") || undefined;
      const sales = await prisma.sale.findMany({
        where: { saleDate: dw, ...(customerId ? { customerId } : {}) },
        orderBy: { saleDate: "desc" },
        take: 500,
        include: { customer: { select: { fullName: true } }, lineItems: { include: { item: { select: { name: true, sku: true } } } } },
      });
      return ok({ type, rows: sales });
    }

    case "purchases": {
      const dw = dateRange(url);
      const beneficiaryId = url.searchParams.get("beneficiaryId") || undefined;
      const rows = await prisma.purchase.findMany({
        where: { txDate: dw, ...(beneficiaryId ? { beneficiaryId } : {}) },
        orderBy: { txDate: "desc" },
        take: 500,
        include: { beneficiary: { select: { fullName: true } } },
      });
      return ok({ type, rows });
    }

    case "customerAging": {
      const customers = await prisma.customer.findMany({ include: { sales: true, payments: true } });
      const now = Date.now();
      const rows = customers
        .map((c) => {
          const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
          for (const s of c.sales) {
            const due = Number(s.dueAmount);
            if (due <= 0) continue;
            const ageDays = Math.floor((now - new Date(s.saleDate).getTime()) / 86400000);
            if (ageDays <= 30) buckets.d0_30 += due;
            else if (ageDays <= 60) buckets.d31_60 += due;
            else if (ageDays <= 90) buckets.d61_90 += due;
            else buckets.d90plus += due;
          }
          const total = Object.values(buckets).reduce((a, b) => a + b, 0);
          return { name: c.fullName, ...buckets, total };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
      return ok({ type, rows });
    }

    case "beneficiaryAging": {
      const beneficiaries = await prisma.beneficiary.findMany({ include: { purchases: true, payments: true } });
      const now = Date.now();
      const rows = beneficiaries
        .map((b) => {
          const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
          for (const p of b.purchases) {
            const due = Number(p.dueAmount);
            if (due <= 0) continue;
            const ageDays = Math.floor((now - new Date(p.txDate).getTime()) / 86400000);
            if (ageDays <= 30) buckets.d0_30 += due;
            else if (ageDays <= 60) buckets.d31_60 += due;
            else if (ageDays <= 90) buckets.d61_90 += due;
            else buckets.d90plus += due;
          }
          const total = Object.values(buckets).reduce((a, b2) => a + b2, 0);
          return { name: b.fullName, ...buckets, total };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);
      return ok({ type, rows });
    }

    case "inventoryMovement": {
      const items = await prisma.inventoryItem.findMany({
        include: { movements: true },
      });
      const rows = items.map((i) => {
        const inKg = i.movements.filter((m) => m.direction === "IN").reduce((a, m) => a.plus(D(m.qtyKg)), D(0));
        const outKg = i.movements.filter((m) => m.direction === "OUT").reduce((a, m) => a.plus(D(m.qtyKg)), D(0));
        const lossKg = i.movements.filter((m) => m.direction === "LOSS").reduce((a, m) => a.plus(D(m.qtyKg)), D(0));
        return {
          sku: i.sku,
          name: i.name,
          type: i.aluminumType,
          in: inKg.toFixed(2),
          out: outKg.toFixed(2),
          loss: lossKg.toFixed(2),
          remaining: D(i.available).toFixed(2),
        };
      });
      return ok({ type, rows });
    }

    case "vaultHistory": {
      const dw = dateRange(url);
      const rows = await prisma.vaultTransaction.findMany({
        where: { txDate: dw },
        orderBy: { txDate: "asc" },
        take: 1000,
      });
      return ok({ type, rows });
    }

    case "bestCustomers": {
      const customers = await prisma.customer.findMany({ include: { sales: true } });
      const rows = customers
        .map((c) => ({
          name: c.fullName,
          count: c.sales.length,
          value: c.sales.reduce((a, s) => a + Number(s.totalAmount), 0),
          paid: c.sales.reduce((a, s) => a + Number(s.cashPaid), 0),
          due: c.sales.reduce((a, s) => a + Number(s.dueAmount), 0),
        }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.value - a.value);
      return ok({ type, rows });
    }

    case "bestBeneficiaries": {
      const beneficiaries = await prisma.beneficiary.findMany({ include: { purchases: true } });
      const rows = beneficiaries
        .map((b) => ({
          name: b.fullName,
          count: b.purchases.length,
          value: b.purchases.reduce((a, p) => a + Number(p.totalPrice), 0),
          paid: b.purchases.reduce((a, p) => a + Number(p.cashPaid), 0),
          due: b.purchases.reduce((a, p) => a + Number(p.dueAmount), 0),
          weight: b.purchases.reduce((a, p) => a + Number(p.weightKg), 0),
        }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.value - a.value);
      return ok({ type, rows });
    }

    default:
      return fail("Unknown report type.", 400);
  }
});
