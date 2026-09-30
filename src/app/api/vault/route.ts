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

  // Money in / out per vault, net of undo entries: a reversal's "out" cancels
  // an earlier "in" (and vice versa), so an undone sale is neither income nor spending.
  const byType = await prisma.vaultTransaction.groupBy({
    by: ["vaultCurrency", "type"],
    _sum: { amountIn: true, amountOut: true },
  });
  const flows = (cur: string) => {
    let gin = D(0), gout = D(0), rin = D(0), rout = D(0);
    for (const r of byType.filter((x) => x.vaultCurrency === cur)) {
      const i = D(r._sum.amountIn ?? 0), o = D(r._sum.amountOut ?? 0);
      if (r.type.endsWith("_REVERSAL")) { rin = rin.plus(i); rout = rout.plus(o); }
      else { gin = gin.plus(i); gout = gout.plus(o); }
    }
    return { totalIn: gin.minus(rout), totalOut: gout.minus(rin), historyNet: gin.plus(rin).minus(gout).minus(rout) };
  };
  const usdFlow = flows("USD");
  const iqdFlow = flows("IQD");
  // Reconciliation: the sum of every history line must equal the stored balance.
  const recon = (cur: "USD" | "IQD", net: ReturnType<typeof flows>["historyNet"]) => {
    const diff = D(vaults[cur].balance).minus(net);
    return { history: net.toFixed(2), balance: D(vaults[cur].balance).toFixed(2), difference: diff.toFixed(2), ok: diff.abs().lt(0.01) };
  };

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
        totalIn: usdFlow.totalIn.toFixed(2),
        totalOut: usdFlow.totalOut.toFixed(2),
        history: recentUsd,
      },
      IQD: {
        balance: D(vaults.IQD.balance).toFixed(2),
        totalIn: iqdFlow.totalIn.toFixed(2),
        totalOut: iqdFlow.totalOut.toFixed(2),
        history: recentIqd,
      },
    },
    exchangeRate: D(settings.exchangeRate).toFixed(4),
    usdEquivalent: D(vaults.USD.balance).plus(D(vaults.IQD.balance).div(D(settings.exchangeRate))).toFixed(2),
    reconciliation: { USD: recon("USD", usdFlow.historyNet), IQD: recon("IQD", iqdFlow.historyNet) },
    transactions,
    total,
    page,
    pageSize,
  });
});
