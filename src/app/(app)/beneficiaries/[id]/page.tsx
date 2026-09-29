"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, StatCard, Badge, Skeleton, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { fmtDate, fmtMoney } from "@/lib/money";

export default function BeneficiaryAccountPage() {
  const { id } = useParams<{ id: string }>();
  const [beneficiary, setBeneficiary] = useState<any>(null);
  const [due, setDue] = useState("0");
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", currency: "USD", vaultCurrency: "USD", notes: "", payDate: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/beneficiaries/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to load", "error");
        return;
      }
      setBeneficiary(data.beneficiary);
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
      const res = await fetch(`/api/beneficiaries/${id}/payments`, {
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

  if (loading) return <Skeleton rows={8} />;
  if (!beneficiary) return <p className="text-sm text-[#6B7280]">Beneficiary not found.</p>;

  const dueNum = Number(due);

  return (
    <div className="space-y-5">
      <Link href="/beneficiaries" className="btn btn-ghost btn-sm no-print w-fit">
        ← Beneficiaries
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{beneficiary.fullName}</h1>
          <p className="text-sm text-[#6B7280]">
            {beneficiary.phone || "No phone"} {beneficiary.address ? `· ${beneficiary.address}` : ""}
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="secondary" onClick={() => window.print()}>Print Statement</Button>
          <Button onClick={() => setPayOpen(true)}>Pay Beneficiary</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Purchases" value={`$${fmtMoney(totals?.totalPurchases ?? 0)}`} sub={`${totals?.purchasesCount ?? 0} purchase(s)`} />
        <StatCard
          label="Due — Factory owes beneficiary"
          value={`$${fmtMoney(due)}`}
          tone={dueNum > 0 ? "bad" : "good"}
          sub={dueNum > 0 ? "Factory owes beneficiary" : dueNum < 0 ? "Overpaid" : "Settled"}
        />
        <StatCard label="Total Paid" value={`$${fmtMoney(totals?.totalPaid ?? 0)}`} />
        <StatCard label="Total Weight" value={`${fmtMoney(totals?.totalWeight ?? 0)} kg`} />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Purchase History</h2>
        {beneficiary.purchases.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-6 text-center">No purchases recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Product</th>
                  <th className="text-right">Weight</th>
                  <th className="text-right">Unit Price</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Cash Paid</th>
                  <th className="text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {beneficiary.purchases.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="code code-strong">{p.number}</span></td>
                    <td>{fmtDate(p.txDate)}</td>
                    <td>
                      {p.productName} <span className="text-[#6B7280] text-xs">({p.sku})</span>
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(p.weightKg)} kg</td>
                    <td className="text-right tabular-nums">{p.currency === "IQD" ? fmtMoney(p.unitPrice, "IQD") : `$${fmtMoney(p.unitPrice)}`}</td>
                    <td className="text-right tabular-nums">{p.currency === "IQD" ? `${fmtMoney(p.totalPrice, "IQD")} IQD` : `$${fmtMoney(p.totalPrice)}`}</td>
                    <td className="text-right tabular-nums">{p.currency === "IQD" ? `${fmtMoney(p.cashPaid, "IQD")} IQD` : `$${fmtMoney(p.cashPaid)}`}</td>
                    <td className={`text-right tabular-nums ${Number(p.dueAmount) > 0 ? "text-[#D93025] font-semibold" : ""}`}>
                      {p.currency === "IQD" ? `${fmtMoney(p.dueAmount, "IQD")} IQD` : `$${fmtMoney(p.dueAmount)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Pay Beneficiary">
        <form onSubmit={submitPayment} className="space-y-4">
          <div className="p-3 rounded-lg bg-[#E8F0FB] text-sm">
            Current due: <strong className={dueNum > 0 ? "text-[#D93025]" : ""}>${fmtMoney(due)}</strong> — Factory owes beneficiary
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPayOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>Record Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
