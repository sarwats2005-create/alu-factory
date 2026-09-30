import { prisma } from "./db";
import { D, toUsd } from "./money";
import { getSettings } from "./settings";
import { Prisma } from "@prisma/client";

/**
 * Balances are kept per currency. A debt raised in IQD and paid in IQD
 * settles to exactly zero — converting both sides to USD at two different
 * dates would leave a phantom residue from rate drift. The USD equivalent
 * (IQD part at today's rate) is only used for ranking, filters and alerts.
 */
export interface CurrencyBalance {
  USD: Prisma.Decimal;
  IQD: Prisma.Decimal;
  /** USD + IQD ÷ current rate. Positive = money is owed. */
  usdEquivalent: Prisma.Decimal;
}

async function currentRate() {
  const s = await getSettings();
  return D(s.exchangeRate);
}

function combine(usd: Prisma.Decimal, iqd: Prisma.Decimal, rate: Prisma.Decimal): CurrencyBalance {
  return { USD: usd, IQD: iqd, usdEquivalent: usd.plus(rate.gt(0) ? iqd.div(rate) : D(0)) };
}

/** Customer balance per currency: SUM(invoice dues) − SUM(later payments). Positive → "Customer owes factory". */
export async function customerBalance(customerId: string, rate?: Prisma.Decimal): Promise<CurrencyBalance> {
  const [sales, payments] = await Promise.all([
    prisma.sale.groupBy({ by: ["currency"], where: { customerId }, _sum: { dueAmount: true } }),
    prisma.customerPayment.groupBy({ by: ["currency"], where: { customerId }, _sum: { amount: true } }),
  ]);
  const part = (c: string) =>
    D(sales.find((s) => s.currency === c)?._sum.dueAmount ?? 0).minus(D(payments.find((p) => p.currency === c)?._sum.amount ?? 0));
  return combine(part("USD"), part("IQD"), rate ?? (await currentRate()));
}

/** Beneficiary balance per currency: SUM(purchase dues) − SUM(later payments). Positive → "Factory owes beneficiary". */
export async function beneficiaryBalance(beneficiaryId: string, rate?: Prisma.Decimal): Promise<CurrencyBalance> {
  const [purchases, payments] = await Promise.all([
    prisma.purchase.groupBy({ by: ["currency"], where: { beneficiaryId }, _sum: { dueAmount: true } }),
    prisma.beneficiaryPayment.groupBy({ by: ["currency"], where: { beneficiaryId }, _sum: { amount: true } }),
  ]);
  const part = (c: string) =>
    D(purchases.find((s) => s.currency === c)?._sum.dueAmount ?? 0).minus(D(payments.find((p) => p.currency === c)?._sum.amount ?? 0));
  return combine(part("USD"), part("IQD"), rate ?? (await currentRate()));
}

/** USD-equivalent customer due (kept for list pages and alerts). */
export async function customerDue(customerId: string, rate?: Prisma.Decimal): Promise<Prisma.Decimal> {
  return (await customerBalance(customerId, rate)).usdEquivalent;
}

/** USD-equivalent beneficiary due. */
export async function beneficiaryDue(beneficiaryId: string, rate?: Prisma.Decimal): Promise<Prisma.Decimal> {
  return (await beneficiaryBalance(beneficiaryId, rate)).usdEquivalent;
}

/**
 * Customer lifetime totals for the account page cards, all in USD equivalent.
 * Each invoice/payment converts at the rate it was recorded with, so history
 * never re-prices itself when today's rate moves.
 */
export async function customerTotals(customerId: string) {
  const rate = await currentRate();
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({ where: { customerId }, select: { totalAmount: true, cashPaid: true, dueAmount: true, cogs: true, currency: true, exchangeRate: true } }),
    prisma.customerPayment.findMany({ where: { customerId }, select: { amount: true, currency: true, exchangeRate: true } }),
  ]);
  const usd = (a: Prisma.Decimal.Value, c: string, r: Prisma.Decimal.Value | null) => toUsd(a, c, r, rate);
  const totalSales = sales.reduce((a, s) => a.plus(usd(s.totalAmount, s.currency, s.exchangeRate)), D(0));
  const cashAtSale = sales.reduce((a, s) => a.plus(usd(s.cashPaid, s.currency, s.exchangeRate)), D(0));
  const paidLater = payments.reduce((a, p) => a.plus(usd(p.amount, p.currency, p.exchangeRate)), D(0));
  // COGS is stored in USD already — never convert it again.
  const cogs = sales.reduce((a, s) => a.plus(D(s.cogs)), D(0));
  return {
    totalSales,
    totalCash: cashAtSale.plus(paidLater),
    cashAtSale,
    paidLater,
    cogs,
    paymentsCount: payments.length,
    salesCount: sales.length,
    profit: totalSales.minus(cogs),
  };
}

/** Beneficiary lifetime totals, USD equivalent. */
export async function beneficiaryTotals(beneficiaryId: string) {
  const rate = await currentRate();
  const [purchases, payments] = await Promise.all([
    prisma.purchase.findMany({ where: { beneficiaryId }, select: { totalPrice: true, cashPaid: true, weightKg: true, currency: true, exchangeRate: true } }),
    prisma.beneficiaryPayment.findMany({ where: { beneficiaryId }, select: { amount: true, currency: true, exchangeRate: true } }),
  ]);
  const usd = (a: Prisma.Decimal.Value, c: string, r: Prisma.Decimal.Value | null) => toUsd(a, c, r, rate);
  const totalPurchases = purchases.reduce((a, p) => a.plus(usd(p.totalPrice, p.currency, p.exchangeRate)), D(0));
  const paidAtPurchase = purchases.reduce((a, p) => a.plus(usd(p.cashPaid, p.currency, p.exchangeRate)), D(0));
  const paidLater = payments.reduce((a, p) => a.plus(usd(p.amount, p.currency, p.exchangeRate)), D(0));
  return {
    totalPurchases,
    totalPaid: paidAtPurchase.plus(paidLater),
    paidAtPurchase,
    paidLater,
    totalWeight: purchases.reduce((a, p) => a.plus(D(p.weightKg)), D(0)),
    paymentsCount: payments.length,
    purchasesCount: purchases.length,
  };
}

/* ============================================================================
   Account statements (ledgers)
   One row per event, oldest first, with a running balance per currency —
   the view an accountant uses to answer "why do they owe this much?".
   ============================================================================ */

export interface LedgerRow {
  id: string;
  kind: "INVOICE" | "PAID_AT_SALE" | "PAYMENT" | "PURCHASE" | "PAID_AT_PURCHASE";
  date: string;
  reference: string;
  description: string;
  currency: string;
  /** Increases what is owed (an invoice to the customer / a purchase from the beneficiary). */
  charge: string;
  /** Decreases what is owed (cash handed over). */
  paid: string;
  /** Running balance in this row's currency after the row. Positive = still owed. */
  balance: string;
  /** Present on standalone payments so the UI can offer "undo". */
  paymentId?: string;
  vaultCurrency?: string;
}

function runLedger(rows: Omit<LedgerRow, "balance">[]): LedgerRow[] {
  const order: Record<LedgerRow["kind"], number> = { INVOICE: 0, PURCHASE: 0, PAID_AT_SALE: 1, PAID_AT_PURCHASE: 1, PAYMENT: 2 };
  // Date first; on the same day each invoice/purchase is followed by its own
  // cash line, and standalone payments come after the documents.
  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.kind === "PAYMENT") - Number(b.kind === "PAYMENT") ||
      a.reference.localeCompare(b.reference) ||
      order[a.kind] - order[b.kind]
  );
  const running: Record<string, Prisma.Decimal> = { USD: D(0), IQD: D(0) };
  return rows.map((r) => {
    running[r.currency] = (running[r.currency] ?? D(0)).plus(D(r.charge)).minus(D(r.paid));
    return { ...r, balance: running[r.currency].toFixed(2) };
  });
}

export async function customerLedger(customerId: string): Promise<LedgerRow[]> {
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({ where: { customerId }, include: { lineItems: { include: { item: { select: { name: true } } } } } }),
    prisma.customerPayment.findMany({ where: { customerId } }),
  ]);
  const rows: Omit<LedgerRow, "balance">[] = [];
  for (const s of sales) {
    const kg = s.lineItems.reduce((a, l) => a.plus(D(l.weightKg)), D(0));
    const names = [...new Set(s.lineItems.map((l) => l.item.name))].join(", ");
    rows.push({
      id: `${s.id}-inv`,
      kind: "INVOICE",
      date: s.saleDate.toISOString(),
      reference: s.invoiceNo,
      description: `Invoice — ${names} (${kg.toFixed(2)} kg)`,
      currency: s.currency,
      charge: D(s.totalAmount).toFixed(2),
      paid: "0.00",
    });
    if (D(s.cashPaid).gt(0)) {
      rows.push({
        id: `${s.id}-cash`,
        kind: "PAID_AT_SALE",
        date: s.saleDate.toISOString(),
        reference: s.invoiceNo,
        description: `Cash paid at the time of sale → ${s.vaultCurrency} vault`,
        currency: s.currency,
        charge: "0.00",
        paid: D(s.cashPaid).toFixed(2),
        vaultCurrency: s.vaultCurrency,
      });
    }
  }
  for (const p of payments) {
    rows.push({
      id: p.id,
      kind: "PAYMENT",
      date: p.payDate.toISOString(),
      reference: p.reference,
      description: `Payment received${p.notes ? ` — ${p.notes}` : ""} → ${p.vaultCurrency} vault`,
      currency: p.currency,
      charge: "0.00",
      paid: D(p.amount).toFixed(2),
      paymentId: p.id,
      vaultCurrency: p.vaultCurrency,
    });
  }
  return runLedger(rows);
}

export async function beneficiaryLedger(beneficiaryId: string): Promise<LedgerRow[]> {
  const [purchases, payments] = await Promise.all([
    prisma.purchase.findMany({ where: { beneficiaryId } }),
    prisma.beneficiaryPayment.findMany({ where: { beneficiaryId } }),
  ]);
  const rows: Omit<LedgerRow, "balance">[] = [];
  for (const p of purchases) {
    rows.push({
      id: `${p.id}-pur`,
      kind: "PURCHASE",
      date: p.txDate.toISOString(),
      reference: p.number,
      description: `Bought ${p.productName} (${D(p.weightKg).toFixed(2)} kg)`,
      currency: p.currency,
      charge: D(p.totalPrice).toFixed(2),
      paid: "0.00",
    });
    if (D(p.cashPaid).gt(0)) {
      rows.push({
        id: `${p.id}-cash`,
        kind: "PAID_AT_PURCHASE",
        date: p.txDate.toISOString(),
        reference: p.number,
        description: `Cash paid at the time of purchase ← ${p.vaultCurrency} vault`,
        currency: p.currency,
        charge: "0.00",
        paid: D(p.cashPaid).toFixed(2),
        vaultCurrency: p.vaultCurrency,
      });
    }
  }
  for (const p of payments) {
    rows.push({
      id: p.id,
      kind: "PAYMENT",
      date: p.payDate.toISOString(),
      reference: p.reference,
      description: `Payment made${p.notes ? ` — ${p.notes}` : ""} ← ${p.vaultCurrency} vault`,
      currency: p.currency,
      charge: "0.00",
      paid: D(p.amount).toFixed(2),
      paymentId: p.id,
      vaultCurrency: p.vaultCurrency,
    });
  }
  return runLedger(rows);
}
