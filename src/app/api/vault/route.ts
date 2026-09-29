import { prisma } from "@/lib/db";
import { ok, handler } from "@/lib/api";
import { getVaults } from "@/lib/vault";
import { getSettings } from "@/lib/settings";
import { D } from "@/lib/money";

export const GET = handler("vault", async (req) => {
  const url = new URL(req.url);
  const vaultFilter = url.searchParams.get("vault"); // USD | IQD | null
  const typeFilter = url.searchParams.get("type") || "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  const [vaults, settings] = await Promise.all([getVaults(), getSettings()]);

  const where: any = {};
  if (vaultFilter === "USD" || vaultFilter === "IQD") where.vaultCurrency = vaultFilter;
  if (typeFilter) where.type = typeFilter;
  if (from || to) {
    where.txDate = {};
    if (from) where.txDate.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.txDate.lte = new Date(`${to}T23:59:59.999Z`);
  }

  const [transactions, total] = await Promise.all([
    prisma.vaultTransaction.findMany({
      where,
      orderBy: { txDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vaultTransaction.count({ where }),
  ]);

  // Aggregate totals per vault
  const usdAgg = await prisma.vaultTransaction.aggregate({
    where: { vaultCurrency: "USD" },
    _sum: { amountIn: true, amountOut: true },
  });
  const iqdAgg = await prisma.vaultTransaction.aggregate({
    where: { vaultCurrency: "IQD" },
    _sum: { amountIn: true, amountOut: true },
  });

  // Balance history over the last 30 txs for sparkline
  const recentUsd = await prisma.vaultTransaction.findMany({
    where: { vaultCurrency: "USD" },
    orderBy: { txDate: "asc" },
    take: 30,
    select: { balanceAfter: true, txDate: true },
  });
  const recentIqd = await prisma.vaultTransaction.findMany({
    where: { vaultCurrency: "IQD" },
    orderBy: { txDate: "asc" },
    take: 30,
    select: { balanceAfter: true, txDate: true },
  });

  return ok({
    vaults: {
      USD: {
        balance: D(vaults.USD.balance).toFixed(2),
        totalIn: D(usdAgg._sum.amountIn ?? 0).toFixed(2),
        totalOut: D(usdAgg._sum.amountOut ?? 0).toFixed(2),
        history: recentUsd,
      },
      IQD: {
        balance: D(vaults.IQD.balance).toFixed(2),
        totalIn: D(iqdAgg._sum.amountIn ?? 0).toFixed(2),
        totalOut: D(iqdAgg._sum.amountOut ?? 0).toFixed(2),
        history: recentIqd,
      },
    },
    exchangeRate: D(settings.exchangeRate).toFixed(4),
    usdEquivalent: D(vaults.USD.balance).plus(D(vaults.IQD.balance).div(D(settings.exchangeRate))).toFixed(2),
    transactions,
    total,
    page,
    pageSize,
  });
});
