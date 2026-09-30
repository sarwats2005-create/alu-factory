"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Cell,
} from "recharts";
import { Card, StatCard, Badge, Skeleton, PageHead } from "@/components/ui";
import SpecularButton from "@/components/SpecularButton";
import { Icon } from "@/components/icons";
import { fmtDate, fmtMoney } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { toast } from "@/components/Toast";

interface RecentTx {
  id: string;
  kind: string;
  ref: string;
  date: string;
  party: string;
  amount: number;
  currency: string;
  status: string;
}

export default function DashboardPage() {
  const { t } = useLang();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        const d = await res.json();
        setData(d);
      } catch {
        toast("Connection lost.", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div>
        <PageHead title={t("dashTitle")} sub={t("dashSub")} />
        <Skeleton cards={6} rows={6} />
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted">{t("noData")}</p>;

  const pnl = Number(data.netProfit);
  const hasData = Number(data.salesAllTime) > 0 || Number(data.purchaseTotal) > 0;

  return (
    <div className="space-y-5">
      <PageHead title={t("dashTitle")} sub={t("dashSub")}>
        <Link href="/reports" className="btn btn-ghost">
          <Icon name="chart" size={15} />
          {t("navReports")}
        </Link>
        <Link href="/pos/purchase" className="btn btn-secondary">
          <Icon name="box" size={15} />
          {t("newPurchase")}
        </Link>
        <SpecularButton href="/pos">
          <Icon name="plus" size={15} />
          {t("newSale")}
        </SpecularButton>
      </PageHead>

      {/* Tier 1 — the three numbers that drive decisions: are we profitable,
          how much cash do we hold, and who owes us. Given room and read first. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          featured
          className="col-span-2 xl:col-span-1"
          label={t("pnlAllTime")}
          value={`${pnl < 0 ? "−" : ""}$${fmtMoney(Math.abs(pnl))}`}
          tone={pnl >= 0 ? "good" : "bad"}
          sub={
            Number(data.processingLoss) > 0
              ? `Sales $${fmtMoney(data.salesAllTime)} − metal cost $${fmtMoney(data.cogs)} − processing loss $${fmtMoney(data.processingLoss)}`
              : `Sales $${fmtMoney(data.salesAllTime)} − cost of metal sold $${fmtMoney(data.cogs)}`
          }
          icon={pnl >= 0 ? "TrendingUp" : "TrendingDown"}
        />
        <StatCard
          label={t("vaultCombined")}
          value={`$${fmtMoney(data.vaultUsdEquivalent)}`}
          sub={`USD ${fmtMoney(data.usdBalance)} / IQD ${fmtMoney(data.iqdBalance, "IQD")}`}
          icon="shield"
        />
        <StatCard
          label={t("customerDues")}
          value={`$${fmtMoney(data.customerDues ?? 0)}`}
          tone={Number(data.customerDues ?? 0) > 0 ? "bad" : "neutral"}
          sub={Number(data.customerDues ?? 0) > 0 ? t("owedByCustomers") : t("nothingOutstanding")}
          icon="scale2"
        />
        <StatCard
          label={t("supplierDues")}
          value={`$${fmtMoney(data.supplierDues ?? 0)}`}
          tone={Number(data.supplierDues ?? 0) > 0 ? "bad" : "neutral"}
          sub={Number(data.supplierDues ?? 0) > 0 ? t("owedToSuppliers") : t("nothingOutstanding")}
          icon="handshake"
        />
      </div>

      {/* Tier 2 — context. Smaller, so it never competes with tier 1. */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label={t("salesThisMonth")}
          value={`$${fmtMoney(data.salesThisMonth)}`}
          sub={`${t("allTime")} $${fmtMoney(data.salesAllTime)}`}
          icon="receipt"
        />
        <StatCard label={t("purchasesAllTime")} value={`$${fmtMoney(data.purchaseTotal)}`} icon="box" />
        <StatCard
          label={t("bestCustomer")}
          value={data.bestCustomer?.name ?? "—"}
          sub={data.bestCustomer ? `$${fmtMoney(data.bestCustomer.value)} ${t("inPurchases")}` : t("noSalesYet")}
          icon="users"
        />
        <StatCard
          label={t("bestBeneficiary")}
          value={data.bestBeneficiary?.name ?? "—"}
          sub={data.bestBeneficiary ? `$${fmtMoney(data.bestBeneficiary.value)} ${t("supplied")}` : t("noPurchasesYet")}
          icon="handshake"
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">{t("monthlyPnl")}</h2>
            <span className="text-[11.5px] text-faint">{t("last12Months")}</span>
          </div>
          {hasData ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.monthly} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-2)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#98a2b3" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#98a2b3" }} axisLine={false} tickLine={false} width={54} />
                <Tooltip
                  cursor={{ fill: "rgba(27,93,177,0.05)" }}
                  formatter={(value: number) => [`$${fmtMoney(value)}`, "P&L"]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-pop)",
                    fontSize: 12.5,
                  }}
                />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={26}>
                  {data.monthly.map((m: any, i: number) => (
                    <Cell key={i} fill={m.profit >= 0 ? "#1E8A44" : "#D93025"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty t={t} />
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">{t("salesByMonth")}</h2>
            <span className="text-[11.5px] text-faint">{t("revenueTrend")}</span>
          </div>
          {hasData ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.monthly} margin={{ top: 4, right: 4, bottom: 0, left: -14 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-2)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#98a2b3" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#98a2b3" }} axisLine={false} tickLine={false} width={54} />
                <Tooltip
                  formatter={(v: number) => [`$${fmtMoney(v)}`, t("revenue")]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-pop)",
                    fontSize: 12.5,
                  }}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--brand)" strokeWidth={2.4} dot={{ r: 2.5, fill: "var(--brand)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty t={t} />
          )}
        </Card>

        <TopListCard title={t("top5Customers")} icon="users" rows={data.topCustomers} t={t} />
        <TopListCard title={t("top5Beneficiaries")} icon="handshake" rows={data.topBeneficiaries} t={t} />
      </div>

      {/* Recent transactions */}
      <Card pad={false}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="section-title">{t("recentTransactions")}</h2>
          <Link href="/invoices" className="text-[12.5px] font-semibold text-[var(--brand)] hover:underline">
            {t("viewAll")}
          </Link>
        </div>
        {data.recent.length === 0 ? (
          <p className="text-[13px] text-faint pb-8 pt-2 text-center border-t border-[var(--border-2)]">
            {t("nothingRecordedYet")}
          </p>
        ) : (
          <div className="tbl-wrap !border-0 !border-t !rounded-none" style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("date")}</th>
                  <th>{t("type")}</th>
                  <th>{t("party")}</th>
                  <th className="num">{t("amount")}</th>
                  <th>{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((tx: RecentTx) => (
                  <tr key={tx.kind + tx.id}>
                    <td><span className="code code-strong">{tx.ref}</span></td>
                    <td className="text-muted whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td>
                      <Badge kind={tx.kind === "Sale" ? "blue" : "orange"} dot>
                        {tx.kind === "Sale" ? t("sale") : t("purchase")}
                      </Badge>
                    </td>
                    <td>{tx.party}</td>
                    <td className="num font-medium">
                      {tx.currency === "IQD" ? `${fmtMoney(tx.amount, "IQD")} IQD` : `$${fmtMoney(tx.amount)}`}
                    </td>
                    <td>
                      <Badge kind={tx.status === "Paid" ? "green" : "red"}>
                        {tx.status === "Paid" ? t("paid") : t("unpaid")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChartEmpty({ t }: { t: (key: string) => string }) {
  return (
    <div className="h-[250px] flex flex-col items-center justify-center text-center px-6">
      <span className="w-10 h-10 rounded-xl bg-[var(--surface-2)] text-faint flex items-center justify-center mb-3">
        <Icon name="chart" size={18} />
      </span>
      <p className="text-[13px] font-medium text-[var(--text)]">{t("nothingChartedYet")}</p>
      <p className="text-[12px] text-faint mt-1">{t("chartFillHint")}</p>
    </div>
  );
}

function TopListCard({
  title,
  icon,
  rows,
  t,
}: {
  title: string;
  icon: string;
  rows: { name: string; value: number }[];
  t: (key: string) => string;
}) {
  const max = Math.max(1, ...(rows || []).map((r) => r.value));
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">{title}</h2>
        <Icon name={icon} size={15} className="text-faint" />
      </div>
      {!rows || rows.length === 0 ? (
        <p className="text-[13px] text-faint py-8 text-center">{t("noDataYet")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                <span className="font-medium truncate max-w-[65%]">{r.name}</span>
                <span className="tabular text-muted">${fmtMoney(r.value)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--border-2)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--brand)] transition-all"
                  style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
