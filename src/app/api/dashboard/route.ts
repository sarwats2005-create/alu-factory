import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";
import { getVaults } from "@/lib/vault";
import { getSettings } from "@/lib/settings";
import { D, startOfMonth, toUsd } from "@/lib/money";
import type { Prisma } from "@prisma/client";
import { processingLossUsd, receivablesAndPayables } from "@/lib/accounting";

export const GET = handler("dashboard", async () => {
  const monthStart = startOfMonth();
  const [salesMonth, salesAll, purchasesAll, settings, vaults] = await Promise.all([
    prisma.sale.aggregate({ where: { saleDate: { gte: monthStart } }, _sum: { totalAmount: true, cashPaid: true } }),
    prisma.sale.aggregate({ _sum: { totalAmount: true, cogs: true } }),
    prisma.purchase.aggregate({ _sum: { totalPrice: true } }),
    getSettings(),
    getVaults(),
  ]);

  // Overall P&L = revenue − COGS (what was sold) — spec defines it as sales − purchases;
  // we report both: netProfit (sales − COGS) and revenueVsPurchases.
  // All amounts are normalized to USD equivalent using each transaction's exchange rate.
  const rate = D(settings.exchangeRate);
  const toUsdLocal = (amount: Prisma.Decimal.Value, currency: string, txRate?: Prisma.Decimal.Value | null) =>
    toUsd(amount, currency, txRate, rate);

  const revenue = D(salesAll._sum.totalAmount ?? 0); // raw sum, kept for reference
  const purchaseTotal = D(purchasesAll._sum.totalPrice ?? 0);

  // USD-normalized revenue/COGS across all sales
  const allSalesForPnl = await prisma.sale.findMany({ select: { currency: true, exchangeRate: true, totalAmount: true, cogs: true } });
  const revenueUsd = allSalesForPnl.reduce((acc, s) => acc.plus(toUsdLocal(s.totalAmount, s.currency, s.exchangeRate)), D(0));
  // COGS is stored in USD on each sale — adding it directly (never re-converting).
  const cogsUsd = allSalesForPnl.reduce((acc, s) => acc.plus(D(s.cogs)), D(0));
  const loss = await processingLossUsd(rate);
  const grossProfit = revenueUsd.minus(cogsUsd);
  const netProfit = grossProfit.minus(loss.total);

  // Monthly P&L series (last 12 months)
  const allSales = await prisma.sale.findMany({ select: { saleDate: true, totalAmount: true, cogs: true, currency: true, exchangeRate: true } });

  const months: { key: string; label: string; revenue: number; cost: number; profit: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: d.toLocaleString("en-US", { month: "short" }), revenue: 0, cost: 0, profit: 0 });
  }
  const monthMap = new Map(months.map((m) => [m.key, m]));
  for (const s of allSales) {
    const dt = new Date(s.saleDate);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const m = monthMap.get(key);
    if (m) {
      const revUsd = Number(toUsdLocal(s.totalAmount, s.currency, s.exchangeRate));
      const cogsUsdM = Number(s.cogs);
      m.revenue += revUsd;
      m.cost += cogsUsdM;
      m.profit += revUsd - cogsUsdM;
    }
  }
  // Processing loss is a cost in the month it happened.
  for (const e of loss.events) {
    const dt = new Date(e.processedAt);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const m = monthMap.get(key);
    if (m) {
      m.cost += Number(e.valueUsd);
      m.profit -= Number(e.valueUsd);
    }
  }

  // Top customers by sales value
  const topCustomers = await prisma.customer.findMany({
    select: {
      id: true,
      fullName: true,
      sales: { select: { totalAmount: true, currency: true, exchangeRate: true } },
    },
  });
  const tc = topCustomers
    .map((c) => ({ name: c.fullName, value: c.sales.reduce((a, s) => a + Number(toUsdLocal(s.totalAmount, s.currency, s.exchangeRate)), 0) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topBeneficiaries = await prisma.beneficiary.findMany({
    select: {
      id: true,
      fullName: true,
      purchases: { select: { totalPrice: true, currency: true, exchangeRate: true } },
    },
  });
  const tb = topBeneficiaries
    .map((b) => ({ name: b.fullName, value: b.purchases.reduce((a, p) => a + Number(toUsdLocal(p.totalPrice, p.currency, p.exchangeRate)), 0) }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Best = highest single value
  const bestCustomer = tc[0] ?? null;
  const bestBeneficiary = tb[0] ?? null;

  // Recent transactions across modules (sales + purchases combined)
  const recentSales = await prisma.sale.findMany({
    orderBy: { saleDate: "desc" },
    take: 5,
    include: { customer: { select: { fullName: true } } },
  });
  const recentPurchases = await prisma.purchase.findMany({
    orderBy: { txDate: "desc" },
    take: 5,
    include: { beneficiary: { select: { fullName: true } } },
  });
  const recent = [
    ...recentSales.map((s) => ({
      id: s.id,
      kind: "Sale" as const,
      ref: s.invoiceNo,
      date: s.saleDate,
      party: s.customer.fullName,
      amount: Number(s.totalAmount),
      currency: s.currency,
      status: Number(s.dueAmount) <= 0 ? "Paid" : Number(s.cashPaid) > 0 ? "Partial" : "Unpaid",
    })),
    ...recentPurchases.map((p) => ({
      id: p.id,
      kind: "Purchase" as const,
      ref: p.number,
      date: p.txDate,
      party: p.beneficiary.fullName,
      amount: Number(p.totalPrice),
      currency: p.currency,
      status: Number(p.dueAmount) <= 0 ? "Paid" : Number(p.cashPaid) > 0 ? "Partial" : "Unpaid",
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const usdEq = D(vaults.USD.balance).plus(D(vaults.IQD.balance).div(D(settings.exchangeRate)));

  // Receivables (customers owe us) and payables (we owe suppliers), per-party
  // balances so advance payments don't hide someone else's debt.
  const { receivable, payable } = await receivablesAndPayables(rate);

  const monthSales = await prisma.sale.findMany({
    where: { saleDate: { gte: monthStart } },
    select: { totalAmount: true, currency: true, exchangeRate: true },
  });
  const salesThisMonthUsd = monthSales.reduce((a, s) => a.plus(toUsdLocal(s.totalAmount, s.currency, s.exchangeRate)), D(0));
  const allPurchasesUsd = await prisma.purchase.findMany({ select: { totalPrice: true, currency: true, exchangeRate: true } });
  const purchaseTotalUsd = allPurchasesUsd.reduce((a, p) => a.plus(toUsdLocal(p.totalPrice, p.currency, p.exchangeRate)), D(0));

  return ok({
    salesThisMonth: salesThisMonthUsd.toFixed(2),
    salesAllTime: revenueUsd.toFixed(2),
    cogs: cogsUsd.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    processingLoss: loss.total.toFixed(2),
    processingLossKg: loss.kg.toFixed(2),
    netProfit: netProfit.toFixed(2),
    revenueVsPurchases: revenueUsd.minus(purchaseTotalUsd).toFixed(2),
    purchaseTotal: purchaseTotalUsd.toFixed(2),
    vaultUsdEquivalent: usdEq.toFixed(2),
    usdBalance: D(vaults.USD.balance).toFixed(2),
    iqdBalance: D(vaults.IQD.balance).toFixed(2),
    customerDues: receivable.toFixed(2),
    supplierDues: payable.toFixed(2),
    monthly: months,
    topCustomers: tc,
    topBeneficiaries: tb,
    bestCustomer,
    bestBeneficiary,
    recent,
  });
});
