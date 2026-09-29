"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, StatCard, Badge, Skeleton, Button, Money } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { fmtDate, fmtMoney } from "@/lib/money";

interface SaleRow {
  id: string;
  invoiceNo: string;
  saleDate: string;
  currency: string;
  totalAmount: string;
  cashPaid: string;
  dueAmount: string;
  vaultCurrency: string;
  lineItems: { id: string; item: { name: string; sku: string }; weightKg: string; unitPrice: string; lineTotal: string }[];
}

export default function CustomerAccountPage() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [due, setDue] = useState("0");
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", currency: "USD", vaultCurrency: "USD", notes: "", payDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to load customer", "error");
        return;
      }
      setCustomer(data.customer);
      setDue(data.due);
      setTotals(data.totals);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payForm),
      });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Payment failed", "error");
      else {
        toast("Payment recorded.", "success");
        setPayOpen(false);
        setPayForm({ ...payForm, amount: "", notes: "" });
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const rows = [["Invoice #", "Date", "Products", "Total", "Cash Paid", "Due", "Vault", "Currency"]];
    for (const s of customer?.sales || []) {
      rows.push([
        s.invoiceNo,
        fmtDate(s.saleDate),
        s.lineItems.map((li: any) => `${li.item.name} (${li.weightKg}kg)`).join("; "),
        s.totalAmount,
        s.cashPaid,
        s.dueAmount,
        s.vaultCurrency,
        s.currency,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `customer-${customer?.fullName.replace(/\s+/g, "-")}-statement.csv`;
    a.click();
  }

  function printStatement() {
    window.print();
  }

  if (loading) return <Skeleton rows={8} />;
  if (!customer) return <p className="text-sm text-[#6B7280]">Customer not found.</p>;

  const dueNum = Number(due);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/customers" className="btn btn-ghost btn-sm w-fit">← Customers</Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {customer.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={customer.photo} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <span className="w-14 h-14 rounded-full bg-[#E8F0FB] text-[#1B5DB1] flex items-center justify-center text-lg font-bold">
              {customer.fullName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold">{customer.fullName}</h1>
            <p className="text-sm text-[#6B7280]">
              {customer.phone || "No phone"} {customer.address ? `· ${customer.address}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <Button variant="secondary" onClick={printStatement}>Print Statement</Button>
          <Button onClick={() => setPayOpen(true)}>Receive Payment</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Cash Received" value={`$${fmtMoney(totals?.totalCash ?? 0)}`} />
        <StatCard
          label="Due Balance — Customer owes factory"
          value={`$${fmtMoney(due)}`}
          tone={dueNum > 0 ? "bad" : "good"}
          sub={dueNum > 0 ? "Customer owes factory" : dueNum < 0 ? "Credit balance" : "Settled"}
        />
        <StatCard label="Net Position" value={`$${fmtMoney(Number(totals?.totalSales ?? 0) - Number(totals?.totalCash ?? 0))}`} />
        <StatCard
          label="Per-Customer Profit"
          value={`$${fmtMoney(totals?.profit ?? 0)}`}
          tone={Number(totals?.profit ?? 0) >= 0 ? "good" : "bad"}
          sub={`${totals?.salesCount ?? 0} invoice(s)`}
        />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Transaction History</h2>
        </div>
        {customer.sales.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-6 text-center">No sales recorded for this customer yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Products</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Cash Paid</th>
                  <th className="text-right">Due</th>
                  <th>Vault</th>
                </tr>
              </thead>
              <tbody>
                {customer.sales.map((s: SaleRow) => (
                  <tr key={s.id}>
                    <td><span className="code code-strong">{s.invoiceNo}</span></td>
                    <td>{fmtDate(s.saleDate)}</td>
                    <td className="text-[#6B7280] text-sm">
                      {s.lineItems.map((li) => `${li.item.name} (${li.weightKg} kg)`).join(", ")}
                    </td>
                    <td className="text-right tabular-nums">{s.currency === "IQD" ? `${fmtMoney(s.totalAmount, "IQD")} IQD` : `$${fmtMoney(s.totalAmount)}`}</td>
                    <td className="text-right tabular-nums">{s.currency === "IQD" ? `${fmtMoney(s.cashPaid, "IQD")} IQD` : `$${fmtMoney(s.cashPaid)}`}</td>
                    <td className={`text-right tabular-nums ${Number(s.dueAmount) > 0 ? "text-[#D93025] font-semibold" : ""}`}>
                      {s.currency === "IQD" ? `${fmtMoney(s.dueAmount, "IQD")} IQD` : `$${fmtMoney(s.dueAmount)}`}
                    </td>
                    <td><Badge kind="blue">{s.vaultCurrency}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Receive Payment">
        <form onSubmit={submitPayment} className="space-y-4">
          <div className="p-3 rounded-lg bg-[#E8F0FB] text-sm">
            Current due balance: <strong className={dueNum > 0 ? "text-[#D93025]" : ""}>${fmtMoney(due)}</strong> — Customer owes factory
          </div>
          <label className="block">
            <span className="lbl">Amount *</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              className="inp"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Currency</span>
              <select value={payForm.currency} onChange={(e) => setPayForm({ ...payForm, currency: e.target.value })} className="inp">
                <option value="USD">USD</option>
                <option value="IQD">IQD</option>
              </select>
            </label>
            <label className="block">
              <span className="lbl">Vault</span>
              <select value={payForm.vaultCurrency} onChange={(e) => setPayForm({ ...payForm, vaultCurrency: e.target.value })} className="inp">
                <option value="USD">USD Vault</option>
                <option value="IQD">IQD Vault</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="lbl">Date</span>
            <input type="date" value={payForm.payDate} onChange={(e) => setPayForm({ ...payForm, payDate: e.target.value })} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Notes</span>
            <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="inp" />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPayOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>Record Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
