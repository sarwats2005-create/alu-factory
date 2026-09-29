"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Skeleton, Button } from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/money";
import { toast } from "@/components/Toast";

const REPORTS = [
  { id: "pnl", label: "Overall P&L Report" },
  { id: "sales", label: "Sales Report" },
  { id: "purchases", label: "Purchase Report" },
  { id: "customerAging", label: "Customer Due Aging" },
  { id: "beneficiaryAging", label: "Beneficiary Due Aging" },
  { id: "inventoryMovement", label: "Inventory Movement" },
  { id: "vaultHistory", label: "Vault Balance History" },
  { id: "bestCustomers", label: "Best Customers" },
  { id: "bestBeneficiaries", label: "Best Beneficiaries" },
];

export default function ReportsPage() {
  const [type, setType] = useState("pnl");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?type=${type}&from=${from}&to=${to}`);
      const d = await res.json();
      setData(d);
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setLoading(false);
    }
  }, [type, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    if (!data) return;
    let rows: string[][] = [];
    const report = REPORTS.find((r) => r.id === type);

    if (type === "pnl" && data) {
      rows = [
        ["Metric", "Amount (USD)"],
        ["Revenue", data.revenue],
        ["Cost of Goods Sold", data.cogs],
        ["Gross Profit", data.grossProfit],
        ["Total Purchases", data.purchaseTotal],
        ["Customer Due (from sales)", data.customerDue],
        ["Factory Due (from purchases)", data.purchaseDue],
      ];
    } else if (type === "sales") {
      rows = [["Invoice #", "Date", "Customer", "Products", "Total", "Cash Paid", "Due", "Currency"]];
      for (const s of data.rows || []) {
        rows.push([s.invoiceNo, fmtDate(s.saleDate), s.customer.fullName,
          s.lineItems.map((li: any) => `${li.item.name} (${li.weightKg}kg)`).join("; "),
          s.totalAmount, s.cashPaid, s.dueAmount, s.currency]);
      }
    } else if (type === "purchases") {
      rows = [["Ref", "Date", "Beneficiary", "Product", "SKU", "Weight", "Unit Price", "Total", "Cash Paid", "Due", "Currency"]];
      for (const p of data.rows || []) {
        rows.push([p.number, fmtDate(p.txDate), p.beneficiary.fullName, p.productName, p.sku,
          p.weightKg, p.unitPrice, p.totalPrice, p.cashPaid, p.dueAmount, p.currency]);
      }
    } else if (type === "customerAging" || type === "beneficiaryAging") {
      rows = [["Name", "0-30 days", "31-60 days", "61-90 days", "90+ days", "Total"]];
      for (const r of data.rows || []) rows.push([r.name, r.d0_30, r.d31_60, r.d61_90, r.d90plus, r.total]);
    } else if (type === "inventoryMovement") {
      rows = [["SKU", "Product", "Type", "In (kg)", "Out (kg)", "Loss (kg)", "Remaining (kg)"]];
      for (const r of data.rows || []) rows.push([r.sku, r.name, r.type, r.in, r.out, r.loss, r.remaining]);
    } else if (type === "vaultHistory") {
      rows = [["Date", "Vault", "Type", "Reference", "Description", "In", "Out", "Balance After"]];
      for (const r of data.rows || []) rows.push([fmtDate(r.txDate), r.vaultCurrency, r.type, r.reference || "", r.description, r.amountIn, r.amountOut, r.balanceAfter]);
    } else if (type === "bestCustomers" || type === "bestBeneficiaries") {
      rows = [["Name", "Transactions", "Value", "Paid", "Due"]];
      for (const r of data.rows || []) rows.push([r.name, r.count, r.value, r.paid, r.due]);
    }

    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report?.label ?? "report"}.csv`;
    a.click();
  }

  const label = REPORTS.find((r) => r.id === type)?.label;

  return (
    <div className="space-y-4">
      <div className="page-head no-print">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Nine report types with date ranges, CSV and print export</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon="download" onClick={exportCsv}>CSV</Button>
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      </div>

      <Card className="p-4 no-print">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block flex-1 min-w-[220px]">
            <span className="lbl">Report Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="inp">
              {REPORTS.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="lbl">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp" />
          </label>
          <Button onClick={load}>Refresh</Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="hidden print:block mb-4">
          <p className="text-lg font-bold">ALU FACTORY — {label}</p>
          <p className="text-xs text-[#6B7280]">
            {from || to ? `Range: ${from || "…"} → ${to || "…"}` : "All time"} · Generated {new Date().toLocaleString()}
          </p>
        </div>

        {loading ? (
          <Skeleton rows={8} />
        ) : (
          <>
            {type === "pnl" && data && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <Stat label="Revenue" value={`$${fmtMoney(data.revenue)}`} good />
                <Stat label="Cost of Goods Sold" value={`$${fmtMoney(data.cogs)}`} />
                <Stat label="Gross Profit" value={`$${fmtMoney(data.grossProfit)}`} good={Number(data.grossProfit) >= 0} bad={Number(data.grossProfit) < 0} />
                <Stat label="Total Purchases" value={`$${fmtMoney(data.purchaseTotal)}`} />
                <Stat label="Customer Due (from sales)" value={`$${fmtMoney(data.customerDue)}`} bad={Number(data.customerDue) > 0} />
                <Stat label="Factory Due (from purchases)" value={`$${fmtMoney(data.purchaseDue)}`} bad={Number(data.purchaseDue) > 0} />
              </div>
            )}

            {type === "sales" && (
              <Table
                head={["Invoice #", "Date", "Customer", "Products", "Total", "Cash", "Due"]}
                rows={(data?.rows || []).map((s: any) => [
                  s.invoiceNo,
                  fmtDate(s.saleDate),
                  s.customer.fullName,
                  s.lineItems.map((li: any) => `${li.item.name}`).join(", "),
                  s.currency === "IQD" ? `${fmtMoney(s.totalAmount, "IQD")} IQD` : `$${fmtMoney(s.totalAmount)}`,
                  s.currency === "IQD" ? `${fmtMoney(s.cashPaid, "IQD")} IQD` : `$${fmtMoney(s.cashPaid)}`,
                  s.currency === "IQD" ? `${fmtMoney(s.dueAmount, "IQD")} IQD` : `$${fmtMoney(s.dueAmount)}`,
                ])}
                empty="No data found for the selected date range."
              />
            )}

            {type === "purchases" && (
              <Table
                head={["Ref", "Date", "Beneficiary", "Product", "Weight", "Total", "Cash", "Due"]}
                rows={(data?.rows || []).map((p: any) => [
                  p.number,
                  fmtDate(p.txDate),
                  p.beneficiary.fullName,
                  `${p.productName} (${p.sku})`,
                  `${fmtMoney(p.weightKg)} kg`,
                  p.currency === "IQD" ? `${fmtMoney(p.totalPrice, "IQD")} IQD` : `$${fmtMoney(p.totalPrice)}`,
                  p.currency === "IQD" ? `${fmtMoney(p.cashPaid, "IQD")} IQD` : `$${fmtMoney(p.cashPaid)}`,
                  p.currency === "IQD" ? `${fmtMoney(p.dueAmount, "IQD")} IQD` : `$${fmtMoney(p.dueAmount)}`,
                ])}
                empty="No data found for the selected date range."
              />
            )}

            {(type === "customerAging" || type === "beneficiaryAging") && (
              <Table
                head={["Name", "0–30 d", "31–60 d", "61–90 d", "90+ d", "Total"]}
                rows={(data?.rows || []).map((r: any) => [
                  r.name,
                  `$${fmtMoney(r.d0_30)}`,
                  `$${fmtMoney(r.d31_60)}`,
                  `$${fmtMoney(r.d61_90)}`,
                  `$${fmtMoney(r.d90plus)}`,
                  `$${fmtMoney(r.total)}`,
                ])}
                empty="No due balances in this range."
              />
            )}

            {type === "inventoryMovement" && (
              <Table
                head={["SKU", "Product", "Type", "In (kg)", "Out (kg)", "Loss (kg)", "Remaining (kg)"]}
                rows={(data?.rows || []).map((r: any) => [r.sku, r.name, r.type, r.in, r.out, r.loss, r.remaining])}
                empty="No inventory recorded."
              />
            )}

            {type === "vaultHistory" && (
              <Table
                head={["Date", "Vault", "Type", "Reference", "In", "Out", "Balance After"]}
                rows={(data?.rows || []).map((r: any) => [
                  fmtDate(r.txDate),
                  r.vaultCurrency,
                  r.type.replaceAll("_", " "),
                  r.reference || "—",
                  Number(r.amountIn) > 0 ? fmtMoney(r.amountIn, r.vaultCurrency) : "—",
                  Number(r.amountOut) > 0 ? fmtMoney(r.amountOut, r.vaultCurrency) : "—",
                  fmtMoney(r.balanceAfter, r.vaultCurrency),
                ])}
                empty="No vault movements in this range."
              />
            )}

            {type === "bestCustomers" && (
              <Table
                head={["#", "Customer", "Invoices", "Value", "Paid", "Due"]}
                rows={(data?.rows || []).map((r: any, i: number) => [i + 1, r.name, r.count, `$${fmtMoney(r.value)}`, `$${fmtMoney(r.paid)}`, `$${fmtMoney(r.due)}`])}
                empty="No customer sales recorded."
              />
            )}

            {type === "bestBeneficiaries" && (
              <Table
                head={["#", "Beneficiary", "Purchases", "Weight (kg)", "Value", "Paid", "Due"]}
                rows={(data?.rows || []).map((r: any, i: number) => [i + 1, r.name, r.count, fmtMoney(r.weight), `$${fmtMoney(r.value)}`, `$${fmtMoney(r.paid)}`, `$${fmtMoney(r.due)}`])}
                empty="No purchases recorded."
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-[#F5F7FA] border border-[#E2E8F0]">
      <p className="text-xs text-[#6B7280] font-medium">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${good ? "text-[#1E8A44]" : bad ? "text-[#D93025]" : "text-[#1A1F36]"}`}>{value}</p>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#6B7280] py-10 text-center">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "font-medium" : ""}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
