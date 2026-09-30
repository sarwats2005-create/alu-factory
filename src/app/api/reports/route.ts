import { prisma } from "@/lib/db";
import { ok, fail, handler } from "@/lib/api";
import { D, toUsd } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import type { Prisma } from "@prisma/client";

/* ==========================================================================
   Report envelope
   --------------------------------------------------------------------------
   Every report type returns the same shape so the client never special-cases
   the payload. The sheet, the CSV writer and the PDF all read from this and
   therefore cannot drift apart.

     { type, title, subtitle, meta, summary[], chart?, columns[], rows[],
       totals?, rowCount, truncated, note? }
   ========================================================================== */

type Align = "left" | "right" | "center";

type SummaryItem = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
};

type Column = { key: string; label: string; align?: Align; width?: string };

type Chart = {
  title: string;
  /** A bar per entry. `color` lets a report tint one series (e.g. loss = red). */
  data: { label: string; value: number; color?: "brand" | "danger" | "success" | "warn" }[];
  /** Renders the value above each bar, e.g. "$12,400" or "312 kg". */
  unit?: "usd" | "kg" | "count";
};

type Range = { from: Date | null; to: Date | null };

/* ---------------- helpers ---------------- */

function readRange(url: URL): Range {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return {
    from: from ? new Date(`${from}T00:00:00.000Z`) : null,
    to: to ? new Date(`${to}T23:59:59.999Z`) : null,
  };
}

/** Build a Prisma date filter, or `{}` when the range is open-ended. */
function where({ from, to }: Range) {
  const w: Record<string, Date | undefined> = {};
  if (from) w.gte = from;
  if (to) w.lte = to;
  return w;
}

const n2 = (v: Prisma.Decimal.Value | null | undefined) => D(v ?? 0).toNumber();

/** Thousands-separated number with 2 decimals. */
const num = (v: number, dp = 2) =>
  v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** USD display string, or an em dash for a true zero. */
const usd = (v: number) => `$ ${num(v)}`;
const usd0 = (v: number) => `$ ${num(v, 0)}`;

const pct = (v: number) => `${num(v, 1)}%`;

/**
 * FIFO allocation of payments against invoices.
 *
 * Aging reports must reflect what a party *still* owes, so recorded payments
 * are applied to the oldest outstanding documents first. Without this the
 * report overstates every balance.
 */
function allocateFifo(
  docs: { amount: number }[],
  payments: { amount: number }[]
): number[] {
  let pool = payments.reduce((a, p) => a + p.amount, 0);
  return docs.map((d) => {
    const applied = Math.min(d.amount, pool);
    pool -= applied;
    return d.amount - applied;
  });
}

/** Bucket an outstanding amount by its age in days, oldest-first. */
function bucketOf(ageDays: number, b: { d0_30: number; d31_60: number; d61_90: number; d90plus: number }) {
  if (ageDays <= 30) b.d0_30 += 1;
  else if (ageDays <= 60) b.d31_60 += 1;
  else if (ageDays <= 90) b.d61_90 += 1;
  else b.d90plus += 1;
}

const DAY = 86400000;

function daysBetween(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY);
}

/** Group rows into calendar days / months and sum a numeric field. */
function bucketByPeriod(
  rows: { at: Date; value: number }[],
  key: "day" | "month"
): Chart["data"] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = r.at;
    const k =
      key === "day"
        ? d.toISOString().slice(0, 10)
        : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    map.set(k, (map.get(k) ?? 0) + r.value);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, value]) => ({
      label:
        key === "day"
          ? new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
          : new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      value: Math.round(value * 100) / 100,
    }));
}

/** Split an aggregate chart into a maximum number of buckets so bars stay legible. */
function thinSeries(series: Chart["data"], max = 24): Chart["data"] {
  if (series.length <= max) return series;
  const out: Chart["data"] = [];
  const size = Math.ceil(series.length / max);
  for (let i = 0; i < series.length; i += size) {
    const chunk = series.slice(i, i + size);
    out.push({
      label: chunk.length > 1 ? `${chunk[0].label} – ${chunk[chunk.length - 1].label}` : chunk[0].label,
      value: Math.round(chunk.reduce((a, c) => a + c.value, 0) * 100) / 100,
    });
  }
  return out;
}

const AGE_BUCKETS: { key: string; label: string }[] = [
  { key: "d0_30", label: "0–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
];

/* ==========================================================================
   GET
   ========================================================================== */

export const GET = handler("reports", async (req) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "pnl";
  const range = readRange(url);
  const settings = await getSettings();
  const rate = D(settings.exchangeRate);
  const usdOf = (amount: Prisma.Decimal.Value, currency: string, txRate?: Prisma.Decimal.Value | null) =>
    n2(toUsd(amount, currency, txRate, rate));

  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(500, Math.max(10, Number(url.searchParams.get("pageSize") ?? "200") || 200));

  const meta = {
    from: range.from ? range.from.toISOString().slice(0, 10) : null,
    to: range.to ? range.to.toISOString().slice(0, 10) : null,
    generatedAt: new Date().toISOString(),
    exchangeRate: rate.toNumber(),
  };

  const build = (o: {
    title: string;
    subtitle: string;
    summary: SummaryItem[];
    columns: Column[];
    rows: Record<string, string>[];
    totals?: Record<string, string>;
    chart?: Chart;
    note?: string;
    truncated?: boolean;
  }) =>
    ok({
      type,
      title: o.title,
      subtitle: o.subtitle,
      meta,
      summary: o.summary,
      chart: o.chart ?? null,
      columns: o.columns,
      rows: o.rows,
      totals: o.totals ?? null,
      rowCount: o.rows.length,
      truncated: o.truncated ?? false,
      page,
      pageSize,
      note: o.note ?? null,
    });

  const AGE_COLS: Column[] = [
    { key: "name", label: "Name", width: "26%" },
    ...AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, align: "right" as Align })),
    { key: "total", label: "Total Outstanding", align: "right" },
  ];

  switch (type) {
    /* ---------------------------------------------------------------- P&L */
    case "pnl": {
      const dw = where(range);
      const sales = await prisma.sale.findMany({
        where: { saleDate: dw },
        select: { saleDate: true, totalAmount: true, cogs: true, cashPaid: true, dueAmount: true, currency: true, exchangeRate: true, lineItems: { select: { weightKg: true } } },
        orderBy: { saleDate: "asc" },
      });
      const purchases = await prisma.purchase.findMany({
        where: { txDate: dw },
        select: { txDate: true, totalPrice: true, cashPaid: true, dueAmount: true, weightKg: true, currency: true, exchangeRate: true },
        orderBy: { txDate: "asc" },
      });

      // Every figure below is USD-equivalent: IQD rows are divided by the rate
      // they were written with, so history is never re-priced by a later rate.
      const revenue = sales.reduce((a, s) => a + usdOf(s.totalAmount, s.currency, s.exchangeRate), 0);
      const cogs = sales.reduce((a, s) => a + usdOf(s.cogs, s.currency, s.exchangeRate), 0);
      const cash = sales.reduce((a, s) => a + usdOf(s.cashPaid, s.currency, s.exchangeRate), 0);
      const grossProfit = revenue - cogs;
      const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const purchaseTotal = purchases.reduce((a, p) => a + usdOf(p.totalPrice, p.currency, p.exchangeRate), 0);
      const purchaseDue = purchases.reduce((a, p) => a + usdOf(p.dueAmount, p.currency, p.exchangeRate), 0);
      const customerDue = sales.reduce((a, s) => a + usdOf(s.dueAmount, s.currency, s.exchangeRate), 0);
      const kgSold = sales.reduce((a, s) => a + s.lineItems.reduce((b, l) => b + n2(l.weightKg), 0), 0);
      const kgBought = purchases.reduce((a, p) => a + n2(p.weightKg), 0);
      const avgInvoice = sales.length ? revenue / sales.length : 0;

      const monthly = new Map<string, { revenue: number; cogs: number }>();
      for (const s of sales) {
        const k = `${s.saleDate.getUTCFullYear()}-${String(s.saleDate.getUTCMonth() + 1).padStart(2, "0")}`;
        const e = monthly.get(k) ?? { revenue: 0, cogs: 0 };
        e.revenue += usdOf(s.totalAmount, s.currency, s.exchangeRate);
        e.cogs += usdOf(s.cogs, s.currency, s.exchangeRate);
        monthly.set(k, e);
      }
      const chart: Chart = {
        title: "Revenue by month",
        unit: "usd",
        data: thinSeries(
          [...monthly.entries()]
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([k, v]) => ({
              label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
              value: Math.round(v.revenue * 100) / 100,
              color: "brand" as const,
            }))
        ),
      };

      const pnlRows = [
        { metric: "Revenue", amount: revenue, base: revenue, note: `${sales.length} invoice${sales.length === 1 ? "" : "s"}` },
        // `0 - x` rather than `-x` so a zero COGS prints as 0.00, not -0.00.
        { metric: "Cost of Goods Sold", amount: cogs === 0 ? 0 : -cogs, base: revenue, note: `${kgSold.toLocaleString("en-US")} kg sold` },
        { metric: "Gross Profit", amount: grossProfit, base: revenue, note: `${pct(margin)} margin` },
        { metric: "Cash Collected", amount: cash, base: revenue, note: "From sales" },
        { metric: "Customer Outstanding", amount: customerDue, base: revenue, note: "Unpaid on sales" },
        { metric: "Purchases (COGS basis)", amount: purchaseTotal, base: revenue, note: `${kgBought.toLocaleString("en-US")} kg bought` },
        { metric: "Factory Outstanding", amount: purchaseDue, base: revenue, note: "Unpaid on purchases" },
      ];

      return build({
        title: "Overall P&L Report",
        subtitle: "Profit and loss, all figures in USD equivalent",
        summary: [
          { key: "revenue", label: "Revenue", value: usd0(revenue), sub: `${sales.length} invoices`, tone: "neutral" },
          { key: "cogs", label: "Cost of Goods Sold", value: usd0(cogs), sub: `${kgSold.toLocaleString("en-US")} kg`, tone: "neutral" },
          { key: "profit", label: "Gross Profit", value: usd0(grossProfit), sub: `${pct(margin)} margin`, tone: grossProfit >= 0 ? "good" : "bad" },
          { key: "purchases", label: "Purchases", value: usd0(purchaseTotal), sub: `${kgBought.toLocaleString("en-US")} kg`, tone: "neutral" },
          { key: "customerDue", label: "Customer Due", value: usd0(customerDue), sub: "Receivable", tone: customerDue > 0 ? "bad" : "good" },
          { key: "purchaseDue", label: "Factory Due", value: usd0(purchaseDue), sub: "Payable", tone: purchaseDue > 0 ? "bad" : "good" },
        ],
        chart,
        columns: [
          { key: "metric", label: "Metric", width: "40%" },
          { key: "amount", label: "Amount (USD)", align: "right" },
          { key: "share", label: "% of Revenue", align: "right" },
          { key: "note", label: "Detail", width: "24%" },
        ],
        rows: pnlRows.map((r) => ({
          metric: r.metric,
          amount: usd(r.amount),
          share: r.base > 0 ? pct((r.amount / r.base) * 100) : "—",
          note: r.note,
        })),
        totals: { metric: "Average invoice value", amount: usd(avgInvoice), share: "—", note: "" },
        note: "All amounts are USD equivalents. Transactions recorded in IQD are converted using the exchange rate stored on the transaction itself.",
      });
    }

    /* -------------------------------------------------------------- Sales */
    case "sales": {
      const dw = where(range);
      const customerId = url.searchParams.get("customerId") || undefined;
      const where_ = { saleDate: dw, ...(customerId ? { customerId } : {}) };
      const [all, count] = await Promise.all([
        prisma.sale.findMany({
          where: where_,
          orderBy: { saleDate: "desc" },
          include: {
            customer: { select: { fullName: true } },
            lineItems: { include: { item: { select: { name: true, sku: true } } } },
          },
        }),
        prisma.sale.count({ where: where_ }),
      ]);

      const shape = (s: (typeof all)[number]) => {
        const usdTotal = usdOf(s.totalAmount, s.currency, s.exchangeRate);
        const weight = s.lineItems.reduce((a, l) => a + n2(l.weightKg), 0);
        return {
          usdTotal,
          usdCash: usdOf(s.cashPaid, s.currency, s.exchangeRate),
          usdDue: usdOf(s.dueAmount, s.currency, s.exchangeRate),
          weight,
        };
      };

      const tRevenue = all.reduce((a, s) => a + shape(s).usdTotal, 0);
      const tCash = all.reduce((a, s) => a + shape(s).usdCash, 0);
      const tDue = all.reduce((a, s) => a + shape(s).usdDue, 0);
      const tWeight = all.reduce((a, s) => a + shape(s).weight, 0);
      const tItems = all.reduce((a, s) => a + s.lineItems.length, 0);
      const payRate = tRevenue > 0 ? (tCash / tRevenue) * 100 : 0;

      const start = (page - 1) * pageSize;
      const pageRows = all.slice(start, start + pageSize);

      return build({
        title: "Sales Report",
        subtitle: "Every invoice in the selected range",
        summary: [
          { key: "invoices", label: "Invoices", value: String(count), sub: `${tItems} line items`, tone: "neutral" },
          { key: "revenue", label: "Revenue (USD)", value: usd0(tRevenue), tone: "neutral" },
          { key: "cash", label: "Cash Collected", value: usd0(tCash), sub: `${pct(payRate)} of sales`, tone: "good" },
          { key: "due", label: "Outstanding", value: usd0(tDue), sub: "Receivable", tone: tDue > 0 ? "bad" : "good" },
          { key: "weight", label: "Weight Sold", value: `${num(tWeight)} kg`, tone: "neutral" },
          { key: "avg", label: "Average Invoice", value: usd0(count ? tRevenue / count : 0), tone: "neutral" },
        ],
        chart: {
          title: "Revenue by day",
          unit: "usd",
          data: thinSeries(bucketByPeriod(all.map((s) => ({ at: s.saleDate, value: shape(s).usdTotal })), "day")),
        },
        columns: [
          { key: "invoiceNo", label: "Invoice #" },
          { key: "date", label: "Date" },
          { key: "customer", label: "Customer", width: "18%" },
          { key: "products", label: "Products", width: "22%" },
          { key: "weight", label: "Weight", align: "right" },
          { key: "currency", label: "Cur." },
          { key: "total", label: "Total", align: "right" },
          { key: "totalUsd", label: "Total (USD)", align: "right" },
          { key: "cash", label: "Cash", align: "right" },
          { key: "due", label: "Due", align: "right" },
        ],
        rows: pageRows.map((s) => {
          const m = shape(s);
          return {
            invoiceNo: s.invoiceNo,
            date: s.saleDate.toISOString().slice(0, 10),
            customer: s.customer.fullName,
            products: s.lineItems.map((l) => l.item.name).join(", ") || "—",
            weight: num(m.weight),
            currency: s.currency,
            total: `${num(n2(s.totalAmount), s.currency === "IQD" ? 0 : 2)} ${s.currency}`,
            totalUsd: num(m.usdTotal),
            cash: `${num(n2(s.cashPaid), s.currency === "IQD" ? 0 : 2)} ${s.currency}`,
            due: `${num(n2(s.dueAmount), s.currency === "IQD" ? 0 : 2)} ${s.currency}`,
          };
        }),
        totals: {
          invoiceNo: "TOTAL (USD)",
          date: "",
          customer: "",
          products: "",
          weight: num(tWeight),
          currency: "",
          // The Total / Cash / Due columns are each stated in the invoice's own
          // currency, so they cannot be summed. The USD column can, and it does.
          total: "",
          totalUsd: num(tRevenue),
          cash: "",
          due: "",
        },
        note: "Each invoice is shown in its own currency, so the Total, Cash and Due columns must not be added together. Use Total (USD) for a like-for-like sum — every invoice is converted at the exchange rate stored on it. Totals cover the full range; rows shown are the current page.",
      });
    }

    /* ---------------------------------------------------------- Purchases */
    case "purchases": {
      const dw = where(range);
      const beneficiaryId = url.searchParams.get("beneficiaryId") || undefined;
      const where_ = { txDate: dw, ...(beneficiaryId ? { beneficiaryId } : {}) };
      const [all, count] = await Promise.all([
        prisma.purchase.findMany({
          where: where_,
          orderBy: { txDate: "desc" },
          include: { beneficiary: { select: { fullName: true } } },
        }),
        prisma.purchase.count({ where: where_ }),
      ]);

      const shape = (p: (typeof all)[number]) => ({
        usdTotal: usdOf(p.totalPrice, p.currency, p.exchangeRate),
        usdCash: usdOf(p.cashPaid, p.currency, p.exchangeRate),
        usdDue: usdOf(p.dueAmount, p.currency, p.exchangeRate),
        weight: n2(p.weightKg),
      });

      const tTotal = all.reduce((a, p) => a + shape(p).usdTotal, 0);
      const tCash = all.reduce((a, p) => a + shape(p).usdCash, 0);
      const tDue = all.reduce((a, p) => a + shape(p).usdDue, 0);
      const tWeight = all.reduce((a, p) => a + shape(p).weight, 0);
      const tAvgKg = tWeight > 0 ? tTotal / tWeight : 0;

      const start = (page - 1) * pageSize;
      const pageRows = all.slice(start, start + pageSize);

      return build({
        title: "Purchase Report",
        subtitle: "Every purchase in the selected range",
        summary: [
          { key: "count", label: "Purchases", value: String(count), tone: "neutral" },
          { key: "total", label: "Total Spend (USD)", value: usd0(tTotal), tone: "neutral" },
          { key: "cash", label: "Cash Paid", value: usd0(tCash), tone: "good" },
          { key: "due", label: "Factory Owes", value: usd0(tDue), sub: "Payable", tone: tDue > 0 ? "bad" : "good" },
          { key: "weight", label: "Weight Bought", value: `${num(tWeight)} kg`, tone: "neutral" },
          { key: "avgKg", label: "Avg Price / kg", value: usd0(tAvgKg), sub: "USD equivalent", tone: "neutral" },
        ],
        chart: {
          title: "Purchase spend by day",
          unit: "usd",
          data: thinSeries(bucketByPeriod(all.map((p) => ({ at: p.txDate, value: shape(p).usdTotal })), "day")),
        },
        columns: [
          { key: "number", label: "Ref" },
          { key: "date", label: "Date" },
          { key: "beneficiary", label: "Beneficiary", width: "18%" },
          { key: "product", label: "Product", width: "20%" },
          { key: "sku", label: "SKU" },
          { key: "aluminumType", label: "Type" },
          { key: "weight", label: "Weight", align: "right" },
          { key: "currency", label: "Cur." },
          { key: "total", label: "Total", align: "right" },
          { key: "totalUsd", label: "Total (USD)", align: "right" },
          { key: "cash", label: "Cash", align: "right" },
          { key: "due", label: "Due", align: "right" },
        ],
        rows: pageRows.map((p) => {
          const m = shape(p);
          return {
            number: p.number,
            date: p.txDate.toISOString().slice(0, 10),
            beneficiary: p.beneficiary.fullName,
            product: p.productName,
            sku: p.sku,
            aluminumType: p.aluminumType,
            weight: num(m.weight),
            currency: p.currency,
            total: `${num(n2(p.totalPrice), p.currency === "IQD" ? 0 : 2)} ${p.currency}`,
            totalUsd: num(m.usdTotal),
            cash: `${num(n2(p.cashPaid), p.currency === "IQD" ? 0 : 2)} ${p.currency}`,
            due: `${num(n2(p.dueAmount), p.currency === "IQD" ? 0 : 2)} ${p.currency}`,
          };
        }),
        totals: {
          number: "TOTAL (USD)",
          date: "",
          beneficiary: "",
          product: "",
          sku: "",
          aluminumType: "",
          weight: num(tWeight),
          currency: "",
          // Mixed-currency columns cannot be summed; the USD column can.
          total: "",
          totalUsd: num(tTotal),
          cash: "",
          due: "",
        },
        note: "Each purchase is shown in its own currency, so the Total, Cash and Due columns must not be added together. Use Total (USD) for a like-for-like sum. Totals cover the full range; rows shown are the current page.",
      });
    }

    /* --------------------------------------------------- Customer aging */
    case "customerAging": {
      const dw = where(range);
      const asOf = range.to ?? new Date();
      const [customers, sales, payments] = await Promise.all([
        prisma.customer.findMany({ select: { id: true, fullName: true } }),
        prisma.sale.findMany({
          where: { saleDate: dw },
          select: { customerId: true, saleDate: true, dueAmount: true, currency: true, exchangeRate: true },
          orderBy: { saleDate: "asc" },
        }),
        prisma.customerPayment.findMany({
          where: { payDate: dw },
          select: { customerId: true, amount: true, currency: true, exchangeRate: true },
        }),
      ]);

      const salesBy = new Map<string, typeof sales>();
      for (const s of sales) {
        const list = salesBy.get(s.customerId) ?? [];
        list.push(s);
        salesBy.set(s.customerId, list);
      }
      const payBy = new Map<string, typeof payments>();
      for (const p of payments) {
        const list = payBy.get(p.customerId) ?? [];
        list.push(p);
        payBy.set(p.customerId, list);
      }

      const rows: Record<string, string>[] = [];
      const grand = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };

      for (const c of customers) {
        const docs = (salesBy.get(c.id) ?? [])
          .filter((s) => n2(s.dueAmount) > 0)
          .map((s) => ({ at: s.saleDate, amount: usdOf(s.dueAmount, s.currency, s.exchangeRate) }))
          .filter((d) => d.amount > 0);
        if (docs.length === 0) continue;

        const pays = (payBy.get(c.id) ?? []).map((p) => ({
          amount: usdOf(p.amount, p.currency, p.exchangeRate),
        }));
        const remaining = allocateFifo(docs, pays);

        const b = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
        docs.forEach((d, i) => {
          const open = remaining[i];
          if (open <= 0) return;
          const age = daysBetween(asOf, d.at);
          const add = b;
          if (age <= 30) add.d0_30 += open;
          else if (age <= 60) add.d31_60 += open;
          else if (age <= 90) add.d61_90 += open;
          else add.d90plus += open;
        });

        const total = b.d0_30 + b.d31_60 + b.d61_90 + b.d90plus;
        if (total <= 0) continue;
        grand.d0_30 += b.d0_30;
        grand.d31_60 += b.d31_60;
        grand.d61_90 += b.d61_90;
        grand.d90plus += b.d90plus;

        rows.push({
          name: c.fullName,
          d0_30: num(b.d0_30),
          d31_60: num(b.d31_60),
          d61_90: num(b.d61_90),
          d90plus: num(b.d90plus),
          total: num(total),
        });
      }

      rows.sort((a, b) => Number(b.total) - Number(a.total));
      const grandTotal = grand.d0_30 + grand.d31_60 + grand.d61_90 + grand.d90plus;
      const over90 = grand.d90plus;

      return build({
        title: "Customer Due Aging",
        subtitle: `Outstanding balances as of ${asOf.toISOString().slice(0, 10)}`,
        summary: [
          { key: "accounts", label: "Accounts With Due", value: String(rows.length), tone: "neutral" },
          { key: "current", label: "Current (0–30 d)", value: usd0(grand.d0_30), tone: "good" },
          { key: "mid", label: "31–90 days", value: usd0(grand.d31_60 + grand.d61_90), tone: "neutral" },
          { key: "over90", label: "Over 90 Days", value: usd0(over90), sub: "Action required", tone: over90 > 0 ? "bad" : "good" },
          { key: "total", label: "Total Receivable", value: usd0(grandTotal), tone: "neutral" },
          { key: "avg", label: "Average per Account", value: usd0(rows.length ? grandTotal / rows.length : 0), tone: "neutral" },
        ],
        chart: {
          title: "Ageing distribution",
          unit: "usd",
          data: AGE_BUCKETS.map((b) => ({
            label: b.label,
            value: Math.round(grand[b.key as keyof typeof grand] * 100) / 100,
            color: b.key === "d90plus" ? ("danger" as const) : b.key === "d0_30" ? ("success" as const) : ("brand" as const),
          })),
        },
        columns: AGE_COLS,
        rows,
        totals: {
          name: "TOTAL",
          d0_30: num(grand.d0_30),
          d31_60: num(grand.d31_60),
          d61_90: num(grand.d61_90),
          d90plus: num(grand.d90plus),
          total: num(grandTotal),
        },
        note: "Amounts still owed: recorded payments are applied to the oldest invoices first, so a settled invoice contributes nothing to any bucket.",
      });
    }

    /* ------------------------------------------------ Beneficiary aging */
    case "beneficiaryAging": {
      const dw = where(range);
      const asOf = range.to ?? new Date();
      const [beneficiaries, purchases, payments] = await Promise.all([
        prisma.beneficiary.findMany({ select: { id: true, fullName: true } }),
        prisma.purchase.findMany({
          where: { txDate: dw },
          select: { beneficiaryId: true, txDate: true, dueAmount: true, currency: true, exchangeRate: true },
          orderBy: { txDate: "asc" },
        }),
        prisma.beneficiaryPayment.findMany({
          where: { payDate: dw },
          select: { beneficiaryId: true, amount: true, currency: true, exchangeRate: true },
        }),
      ]);

      const byBen = new Map<string, typeof purchases>();
      for (const p of purchases) {
        const list = byBen.get(p.beneficiaryId) ?? [];
        list.push(p);
        byBen.set(p.beneficiaryId, list);
      }
      const payBy = new Map<string, typeof payments>();
      for (const p of payments) {
        const list = payBy.get(p.beneficiaryId) ?? [];
        list.push(p);
        payBy.set(p.beneficiaryId, list);
      }

      const rows: Record<string, string>[] = [];
      const grand = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };

      for (const b of beneficiaries) {
        const docs = (byBen.get(b.id) ?? [])
          .filter((p) => n2(p.dueAmount) > 0)
          .map((p) => ({ at: p.txDate, amount: usdOf(p.dueAmount, p.currency, p.exchangeRate) }))
          .filter((d) => d.amount > 0);
        if (docs.length === 0) continue;

        const pays = (payBy.get(b.id) ?? []).map((p) => ({ amount: usdOf(p.amount, p.currency, p.exchangeRate) }));
        const remaining = allocateFifo(docs, pays);

        const bucket = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
        docs.forEach((d, i) => {
          const open = remaining[i];
          if (open <= 0) return;
          const age = daysBetween(asOf, d.at);
          if (age <= 30) bucket.d0_30 += open;
          else if (age <= 60) bucket.d31_60 += open;
          else if (age <= 90) bucket.d61_90 += open;
          else bucket.d90plus += open;
        });

        const total = bucket.d0_30 + bucket.d31_60 + bucket.d61_90 + bucket.d90plus;
        if (total <= 0) continue;
        grand.d0_30 += bucket.d0_30;
        grand.d31_60 += bucket.d31_60;
        grand.d61_90 += bucket.d61_90;
        grand.d90plus += bucket.d90plus;

        rows.push({
          name: b.fullName,
          d0_30: num(bucket.d0_30),
          d31_60: num(bucket.d31_60),
          d61_90: num(bucket.d61_90),
          d90plus: num(bucket.d90plus),
          total: num(total),
        });
      }

      rows.sort((a, b) => Number(b.total) - Number(a.total));
      const grandTotal = grand.d0_30 + grand.d31_60 + grand.d61_90 + grand.d90plus;

      return build({
        title: "Beneficiary Due Aging",
        subtitle: `Amounts owed to suppliers as of ${asOf.toISOString().slice(0, 10)}`,
        summary: [
          { key: "accounts", label: "Suppliers With Due", value: String(rows.length), tone: "neutral" },
          { key: "current", label: "Current (0–30 d)", value: usd0(grand.d0_30), tone: "neutral" },
          { key: "mid", label: "31–90 days", value: usd0(grand.d31_60 + grand.d61_90), tone: "warn" as SummaryItem["tone"] },
          { key: "over90", label: "Over 90 Days", value: usd0(grand.d90plus), sub: "Escalate", tone: grand.d90plus > 0 ? "bad" : "good" },
          { key: "total", label: "Total Payable", value: usd0(grandTotal), tone: "neutral" },
          { key: "avg", label: "Average per Supplier", value: usd0(rows.length ? grandTotal / rows.length : 0), tone: "neutral" },
        ],
        chart: {
          title: "Ageing distribution",
          unit: "usd",
          data: AGE_BUCKETS.map((b) => ({
            label: b.label,
            value: Math.round(grand[b.key as keyof typeof grand] * 100) / 100,
            color: b.key === "d90plus" ? ("danger" as const) : b.key === "d0_30" ? ("warn" as const) : ("brand" as const),
          })),
        },
        columns: AGE_COLS,
        rows,
        totals: {
          name: "TOTAL",
          d0_30: num(grand.d0_30),
          d31_60: num(grand.d31_60),
          d61_90: num(grand.d61_90),
          d90plus: num(grand.d90plus),
          total: num(grandTotal),
        },
        note: "Amounts the factory still owes: recorded payments are applied to the oldest purchases first.",
      });
    }

    /* ------------------------------------------- Inventory movement */
    case "inventoryMovement": {
      const dw = where(range);
      const items = await prisma.inventoryItem.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
          aluminumType: true,
          available: true,
          totalPurchased: true,
          totalProcessed: true,
          movements: { select: { direction: true, qtyKg: true, movedAt: true } },
        },
      });

      const rows: Record<string, string>[] = [];
      const chartPoints: { sku: string; in: number }[] = [];
      let tOpen = 0;
      let tIn = 0;
      let tOut = 0;
      let tLoss = 0;
      let tClose = 0;

      for (const it of items) {
        // Opening balance is the net of everything that happened BEFORE the
        // range; in-range movements then roll it forward to the closing figure.
        // Reading the movement ledger (rather than `available`) is what lets the
        // report stay honest when the range ends in the past.
        let opening = 0;
        let inKg = 0;
        let outKg = 0;
        let lossKg = 0;
        for (const m of it.movements) {
          const q = n2(m.qtyKg);
          const inRange = (!range.from || m.movedAt >= range.from) && (!range.to || m.movedAt <= range.to);
          if (m.direction === "IN") {
            if (inRange) inKg += q;
            else opening += q;
          } else if (m.direction === "OUT") {
            if (inRange) outKg += q;
            else opening -= q;
          } else {
            if (inRange) lossKg += q;
            else opening -= q;
          }
        }
        const closing = opening + inKg - outKg - lossKg;
        const net = inKg - outKg - lossKg;

        tOpen += opening;
        tIn += inKg;
        tOut += outKg;
        tLoss += lossKg;
        tClose += closing;
        chartPoints.push({ sku: it.sku, in: inKg });

        rows.push({
          sku: it.sku,
          name: it.name,
          type: it.aluminumType,
          opening: num(opening),
          in: num(inKg),
          out: num(outKg),
          loss: num(lossKg),
          net: num(net),
          closing: num(closing),
          available: num(n2(it.available)),
        });
      }

      rows.sort((a, b) => Number(b.closing) - Number(a.closing));
      const lossPct = tIn > 0 ? (tLoss / tIn) * 100 : 0;
      const lowCount = rows.filter((r) => Number(r.closing) <= 0).length;

      return build({
        title: "Inventory Movement Report",
        subtitle: "Stock in, out and processing loss for the selected range",
        summary: [
          { key: "items", label: "Stock Items", value: String(rows.length), sub: `${lowCount} at zero`, tone: "neutral" },
          { key: "in", label: "Received", value: `${num(tIn)} kg`, tone: "good" },
          { key: "out", label: "Sold / Issued", value: `${num(tOut)} kg`, tone: "neutral" },
          { key: "loss", label: "Processing Loss", value: `${num(tLoss)} kg`, sub: `${pct(lossPct)} of intake`, tone: tLoss > 0 ? "bad" : "good" },
          { key: "net", label: "Net Change", value: `${num(tIn - tOut - tLoss)} kg`, tone: tIn - tOut - tLoss >= 0 ? "good" : "neutral" },
          { key: "closing", label: "Closing Stock", value: `${num(tClose)} kg`, tone: "neutral" },
        ],
        chart: {
          title: "Received vs processed by item (kg)",
          unit: "kg",
          // Built from the numeric tuples, not the formatted row strings —
          // Number("5,433.00") is NaN, which would blank the whole chart.
          data: thinSeries(
            chartPoints.slice(0, 14).map((p) => ({ label: p.sku, value: Math.round(p.in * 100) / 100, color: "success" as const })),
            14
          ),
        },
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "Product", width: "22%" },
          { key: "type", label: "Type" },
          { key: "opening", label: "Opening", align: "right" },
          { key: "in", label: "In (kg)", align: "right" },
          { key: "out", label: "Out (kg)", align: "right" },
          { key: "loss", label: "Loss (kg)", align: "right" },
          { key: "net", label: "Net (kg)", align: "right" },
          { key: "closing", label: "Closing (kg)", align: "right" },
          { key: "available", label: "Live Stock (kg)", align: "right" },
        ],
        rows,
        totals: {
          sku: "TOTAL",
          name: "",
          type: "",
          opening: num(tOpen),
          in: num(tIn),
          out: num(tOut),
          loss: num(tLoss),
          net: num(tIn - tOut - tLoss),
          closing: num(tClose),
          available: num(items.reduce((a, i) => a + n2(i.available), 0)),
        },
        note: "Opening and closing balances are rolled forward from the movement ledger, so they stay correct for ranges that end in the past. Live Stock is the current on-hand figure regardless of range.",
      });
    }

    /* ------------------------------------------------- Vault history */
    case "vaultHistory": {
      const dw = where(range);
      const [rows, vaults] = await Promise.all([
        prisma.vaultTransaction.findMany({
          where: { txDate: dw },
          orderBy: { txDate: "asc" },
          include: {
            sale: { select: { invoiceNo: true } },
            purchase: { select: { number: true } },
            vaultOp: { select: { label: true } },
            customerPayment: { select: { reference: true } },
            beneficiaryPayment: { select: { reference: true } },
          },
        }),
        prisma.vault.findMany(),
      ]);

      const reference = (t: (typeof rows)[number]) =>
        t.sale?.invoiceNo ??
        t.purchase?.number ??
        t.vaultOp?.label ??
        t.customerPayment?.reference ??
        t.beneficiaryPayment?.reference ??
        "—";

      const label = (t: string) =>
        t
          .toLowerCase()
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      // Opening balance per currency = last recorded balance before the range.
      const opening = new Map<string, number>();
      for (const v of vaults) opening.set(v.currency, 0);
      if (range.from) {
        const prior = await prisma.vaultTransaction.findMany({
          where: { txDate: { lt: range.from } },
          orderBy: { txDate: "desc" },
          distinct: ["vaultCurrency"],
          select: { vaultCurrency: true, balanceAfter: true },
        });
        for (const p of prior) opening.set(p.vaultCurrency, n2(p.balanceAfter));
      }

      const totalsBy = new Map<string, { in: number; out: number; count: number }>();
      for (const v of vaults) totalsBy.set(v.currency, { in: 0, out: 0, count: 0 });
      for (const t of rows) {
        const e = totalsBy.get(t.vaultCurrency) ?? { in: 0, out: 0, count: 0 };
        e.in += n2(t.amountIn);
        e.out += n2(t.amountOut);
        e.count += 1;
        totalsBy.set(t.vaultCurrency, e);
      }

      const usd = totalsBy.get("USD") ?? { in: 0, out: 0, count: 0 };
      const iqd = totalsBy.get("IQD") ?? { in: 0, out: 0, count: 0 };
      const usdNet = usd.in - usd.out;
      const iqdNet = iqd.in - iqd.out;
      const usdBalance = vaults.find((v) => v.currency === "USD");
      const iqdBalance = vaults.find((v) => v.currency === "IQD");

      return build({
        title: "Vault Balance History",
        subtitle: "Every movement through the USD and IQD vaults",
        summary: [
          { key: "moves", label: "Movements", value: String(rows.length), tone: "neutral" },
          { key: "usdIn", label: "USD In / Out", value: `${usd0(usd.in)} / ${usd0(usd.out)}`, tone: "neutral" },
          { key: "usdNet", label: "USD Net", value: usd0(usdNet), tone: usdNet >= 0 ? "good" : "bad" },
          { key: "iqdIn", label: "IQD In / Out", value: `${num(iqd.in, 0)} / ${num(iqd.out, 0)}`, tone: "neutral" },
          { key: "iqdNet", label: "IQD Net", value: num(iqdNet, 0), tone: iqdNet >= 0 ? "good" : "bad" },
          { key: "balance", label: "Current Balances", value: `${usd0(n2(usdBalance?.balance))} · ${num(n2(iqdBalance?.balance), 0)} IQD`, sub: "USD · IQD", tone: "neutral" },
        ],
        chart: {
          title: "Daily net movement (USD)",
          unit: "usd",
          data: thinSeries(
            bucketByPeriod(
              rows
                .filter((t) => t.vaultCurrency === "USD")
                .map((t) => ({ at: t.txDate, value: n2(t.amountIn) - n2(t.amountOut) })),
              "day"
            )
          ),
        },
        columns: [
          { key: "date", label: "Date" },
          { key: "time", label: "Time" },
          { key: "vault", label: "Vault" },
          { key: "type", label: "Type", width: "18%" },
          { key: "reference", label: "Reference" },
          { key: "in", label: "In", align: "right" },
          { key: "out", label: "Out", align: "right" },
          { key: "balance", label: "Balance After", align: "right" },
        ],
        rows: rows.map((t) => ({
          date: t.txDate.toISOString().slice(0, 10),
          time: t.txDate.toISOString().slice(11, 16),
          vault: t.vaultCurrency,
          type: label(t.type),
          reference: reference(t),
          in: n2(t.amountIn) > 0 ? num(n2(t.amountIn), t.vaultCurrency === "IQD" ? 0 : 2) : "—",
          out: n2(t.amountOut) > 0 ? num(n2(t.amountOut), t.vaultCurrency === "IQD" ? 0 : 2) : "—",
          balance: num(n2(t.balanceAfter), t.vaultCurrency === "IQD" ? 0 : 2),
        })),
        // No totals row: the In / Out columns mix USD and IQD, so no single
        // cell can honestly hold their sum. The summary tiles above carry the
        // per-currency figures instead.
        note: "In and Out are stated in each row's own vault currency — do not add the USD and IQD figures together. Per-currency totals and closing balances are in the summary above. Balance After is the vault balance immediately following that movement.",
      });
    }

    /* ------------------------------------------------- Best customers */
    case "bestCustomers": {
      const dw = where(range);
      const [customers, sales, payments] = await Promise.all([
        prisma.customer.findMany({ select: { id: true, fullName: true, phone: true } }),
        prisma.sale.findMany({
          where: { saleDate: dw },
          select: { customerId: true, saleDate: true, totalAmount: true, cashPaid: true, dueAmount: true, currency: true, exchangeRate: true, lineItems: { select: { weightKg: true } } },
          orderBy: { saleDate: "asc" },
        }),
        prisma.customerPayment.findMany({
          where: { payDate: dw },
          select: { customerId: true, amount: true, currency: true, exchangeRate: true },
        }),
      ]);

      const byCust = new Map<string, typeof sales>();
      for (const s of sales) {
        const l = byCust.get(s.customerId) ?? [];
        l.push(s);
        byCust.set(s.customerId, l);
      }
      const payBy = new Map<string, number>();
      for (const p of payments) {
        payBy.set(p.customerId, (payBy.get(p.customerId) ?? 0) + usdOf(p.amount, p.currency, p.exchangeRate));
      }

      const agg = customers
        .map((c) => {
          const list = byCust.get(c.id) ?? [];
          if (list.length === 0) return null;
          const value = list.reduce((a, s) => a + usdOf(s.totalAmount, s.currency, s.exchangeRate), 0);
          const weight = list.reduce((a, s) => a + s.lineItems.reduce((b, l) => b + n2(l.weightKg), 0), 0);
          const paidOnSale = list.reduce((a, s) => a + usdOf(s.cashPaid, s.currency, s.exchangeRate), 0);
          // Payments recorded outside the invoice are real collections too.
          const paid = paidOnSale + (payBy.get(c.id) ?? 0);
          const due = Math.max(0, value - paid);
          return { name: c.fullName, phone: c.phone ?? "", count: list.length, weight, value, paid, due };
        })
        .filter(Boolean) as { name: string; phone: string; count: number; weight: number; value: number; paid: number; due: number }[];

      agg.sort((a, b) => b.value - a.value);
      const grandValue = agg.reduce((a, r) => a + r.value, 0);
      const grandPaid = agg.reduce((a, r) => a + r.paid, 0);
      const grandDue = agg.reduce((a, r) => a + r.due, 0);
      const grandCount = agg.reduce((a, r) => a + r.count, 0);
      const grandWeight = agg.reduce((a, r) => a + r.weight, 0);

      const top = agg[0];
      const start = (page - 1) * pageSize;
      const pageRows = agg.slice(start, start + pageSize);

      return build({
        title: "Best Customers",
        subtitle: "Customers ranked by revenue in the selected range",
        summary: [
          { key: "accounts", label: "Active Customers", value: String(agg.length), tone: "neutral" },
          { key: "revenue", label: "Total Revenue (USD)", value: usd0(grandValue), tone: "neutral" },
          { key: "paid", label: "Collected", value: usd0(grandPaid), sub: `${pct(grandValue ? (grandPaid / grandValue) * 100 : 0)} of sales`, tone: "good" },
          { key: "due", label: "Outstanding", value: usd0(grandDue), tone: grandDue > 0 ? "bad" : "good" },
          { key: "top", label: "Top Customer", value: top ? top.name : "—", sub: top ? usd0(top.value) : "", tone: "neutral" },
          { key: "avg", label: "Average per Customer", value: usd0(agg.length ? grandValue / agg.length : 0), sub: `${grandCount} invoices`, tone: "neutral" },
        ],
        chart: {
          title: "Top 10 customers (USD)",
          unit: "usd",
          data: agg.slice(0, 10).map((r) => ({ label: r.name, value: Math.round(r.value * 100) / 100, color: "brand" as const })),
        },
        columns: [
          { key: "rank", label: "#", align: "center" },
          { key: "name", label: "Customer", width: "24%" },
          { key: "phone", label: "Phone" },
          { key: "invoices", label: "Invoices", align: "right" },
          { key: "weight", label: "Weight (kg)", align: "right" },
          { key: "value", label: "Revenue (USD)", align: "right" },
          { key: "share", label: "Share", align: "right" },
          { key: "paid", label: "Collected", align: "right" },
          { key: "due", label: "Outstanding", align: "right" },
        ],
        rows: pageRows.map((r, i) => ({
          rank: String(start + i + 1),
          name: r.name,
          phone: r.phone || "—",
          invoices: String(r.count),
          weight: num(r.weight),
          value: num(r.value),
          share: grandValue > 0 ? pct((r.value / grandValue) * 100) : "—",
          paid: num(r.paid),
          due: num(r.due),
        })),
        totals: {
          rank: "",
          name: "TOTAL",
          phone: "",
          invoices: String(grandCount),
          weight: num(grandWeight),
          value: num(grandValue),
          share: "100.0%",
          paid: num(grandPaid),
          due: num(grandDue),
        },
        note: "Collected includes payments recorded on the invoice plus any standalone customer payment received in the same range.",
      });
    }

    /* --------------------------------------------- Best beneficiaries */
    case "bestBeneficiaries": {
      const dw = where(range);
      const [beneficiaries, purchases, payments] = await Promise.all([
        prisma.beneficiary.findMany({ select: { id: true, fullName: true, phone: true } }),
        prisma.purchase.findMany({
          where: { txDate: dw },
          select: { beneficiaryId: true, totalPrice: true, cashPaid: true, dueAmount: true, weightKg: true, currency: true, exchangeRate: true },
        }),
        prisma.beneficiaryPayment.findMany({
          where: { payDate: dw },
          select: { beneficiaryId: true, amount: true, currency: true, exchangeRate: true },
        }),
      ]);

      const byBen = new Map<string, typeof purchases>();
      for (const p of purchases) {
        const l = byBen.get(p.beneficiaryId) ?? [];
        l.push(p);
        byBen.set(p.beneficiaryId, l);
      }
      const payBy = new Map<string, number>();
      for (const p of payments) {
        payBy.set(p.beneficiaryId, (payBy.get(p.beneficiaryId) ?? 0) + usdOf(p.amount, p.currency, p.exchangeRate));
      }

      const agg = beneficiaries
        .map((b) => {
          const list = byBen.get(b.id) ?? [];
          if (list.length === 0) return null;
          const value = list.reduce((a, p) => a + usdOf(p.totalPrice, p.currency, p.exchangeRate), 0);
          const weight = list.reduce((a, p) => a + n2(p.weightKg), 0);
          const paid = list.reduce((a, p) => a + usdOf(p.cashPaid, p.currency, p.exchangeRate), 0) + (payBy.get(b.id) ?? 0);
          return { name: b.fullName, phone: b.phone ?? "", count: list.length, weight, value, paid, due: Math.max(0, value - paid) };
        })
        .filter(Boolean) as { name: string; phone: string; count: number; weight: number; value: number; paid: number; due: number }[];

      agg.sort((a, b) => b.value - a.value);
      const grandValue = agg.reduce((a, r) => a + r.value, 0);
      const grandPaid = agg.reduce((a, r) => a + r.paid, 0);
      const grandDue = agg.reduce((a, r) => a + r.due, 0);
      const grandCount = agg.reduce((a, r) => a + r.count, 0);
      const grandWeight = agg.reduce((a, r) => a + r.weight, 0);
      const top = agg[0];

      const start = (page - 1) * pageSize;
      const pageRows = agg.slice(start, start + pageSize);

      return build({
        title: "Best Beneficiaries",
        subtitle: "Suppliers ranked by purchase value in the selected range",
        summary: [
          { key: "accounts", label: "Active Suppliers", value: String(agg.length), tone: "neutral" },
          { key: "spend", label: "Total Spend (USD)", value: usd0(grandValue), tone: "neutral" },
          { key: "paid", label: "Paid Out", value: usd0(grandPaid), sub: `${pct(grandValue ? (grandPaid / grandValue) * 100 : 0)} settled`, tone: "good" },
          { key: "due", label: "Owed to Suppliers", value: usd0(grandDue), sub: "Payable", tone: grandDue > 0 ? "bad" : "good" },
          { key: "top", label: "Top Supplier", value: top ? top.name : "—", sub: top ? usd0(top.value) : "", tone: "neutral" },
          { key: "avg", label: "Average per Supplier", value: usd0(agg.length ? grandValue / agg.length : 0), sub: `${grandWeight.toFixed(0)} kg`, tone: "neutral" },
        ],
        chart: {
          title: "Top 10 suppliers (USD)",
          unit: "usd",
          data: agg.slice(0, 10).map((r) => ({ label: r.name, value: Math.round(r.value * 100) / 100, color: "brand" as const })),
        },
        columns: [
          { key: "rank", label: "#", align: "center" },
          { key: "name", label: "Beneficiary", width: "24%" },
          { key: "phone", label: "Phone" },
          { key: "purchases", label: "Purchases", align: "right" },
          { key: "weight", label: "Weight (kg)", align: "right" },
          { key: "value", label: "Value (USD)", align: "right" },
          { key: "share", label: "Share", align: "right" },
          { key: "paid", label: "Paid", align: "right" },
          { key: "due", label: "Owed", align: "right" },
        ],
        rows: pageRows.map((r, i) => ({
          rank: String(start + i + 1),
          name: r.name,
          phone: r.phone || "—",
          purchases: String(r.count),
          weight: num(r.weight),
          value: num(r.value),
          share: grandValue > 0 ? pct((r.value / grandValue) * 100) : "—",
          paid: num(r.paid),
          due: num(r.due),
        })),
        totals: {
          rank: "",
          name: "TOTAL",
          phone: "",
          purchases: String(grandCount),
          weight: num(grandWeight),
          value: num(grandValue),
          share: "100.0%",
          paid: num(grandPaid),
          due: num(grandDue),
        },
        note: "Paid includes cash settled on the purchase plus any standalone supplier payment received in the same range.",
      });
    }

    default:
      return fail("Unknown report type.", 400);
  }
});
