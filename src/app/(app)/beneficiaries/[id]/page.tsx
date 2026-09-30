"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, StatCard, Skeleton, Button, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { AccountStatement, ImpactList, balanceText, money, type Balance, type Impact, type LedgerRow } from "@/components/Accounting";
import { fmtDate, fmtMoney } from "@/lib/money";

export default function BeneficiaryAccountPage() {
  const { id } = useParams<{ id: string }>();
  const [beneficiary, setBeneficiary] = useState<any>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [totals, setTotals] = useState<any>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [tab, setTab] = useState<"statement" | "purchases">("statement");
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", currency: "USD", vaultCurrency: "USD", notes: "", payDate: new Date().toISOString().slice(0, 10) });
  const [undoing, setUndoing] = useState<LedgerRow | null>(null);
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
      setBalance(data.balance);
      setTotals(data.totals);
      setLedger(data.ledger || []);
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
        toast(`Payment ${data.payment?.reference ?? ""} recorded.`, "success");
        setPayOpen(false);
        setPayForm({ ...payForm, amount: "", notes: "" });
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function undoPayment() {
    if (!undoing?.paymentId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/beneficiaries/${id}/payments?paymentId=${undoing.paymentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Could not undo payment", "error");
      else {
        toast(`Payment ${undoing.reference} undone.`, "success");
        load();
      }
    } finally {
      setBusy(false);
      setUndoing(null);
    }
  }

  if (loading) return <Skeleton rows={8} />;
  if (!beneficiary) return <p className="text-sm text-muted">Beneficiary not found.</p>;

  const dueNum = Number(balance?.usdEquivalent ?? 0);
  const owedInPayCurrency = Number(balance?.[payForm.currency as "USD" | "IQD"] ?? 0);
  const payAmount = Number(payForm.amount) || 0;
  const cross = payForm.currency !== payForm.vaultCurrency;

  const payImpact: Impact[] = [];
  if (payAmount > 0) {
    payImpact.push({
      icon: "wallet",
      tone: "out",
      text: (
        <>
          <strong>{money(payAmount, payForm.currency)}</strong> leaves the <strong>{payForm.vaultCurrency} vault</strong>
          {cross && " (converted at today's exchange rate)"}.
        </>
      ),
    });
    const after = owedInPayCurrency - payAmount;
    payImpact.push(
      after > 0.004
        ? { icon: "handshake", text: <>The factory will still owe {beneficiary.fullName} <strong>{money(after, payForm.currency)}</strong>.</> }
        : after < -0.004
        ? {
            icon: "alert",
            tone: "warn",
            text: <>This is <strong>{money(-after, payForm.currency)}</strong> more than the factory owes in {payForm.currency}. {beneficiary.fullName} will owe that back (an advance).</>,
          }
        : { icon: "check", tone: "in", text: <>The {payForm.currency} balance with {beneficiary.fullName} will be fully <strong>settled</strong>.</> }
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href="/beneficiaries">Beneficiaries</BackLink>
          <div className="flex items-center gap-3">
            <span className="w-14 h-14 rounded-full bg-[#E8F0FB] text-[#1B5DB1] flex items-center justify-center text-lg font-bold shrink-0">
              {beneficiary.fullName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="page-title">{beneficiary.fullName}</h1>
              <p className="entity-meta">
                <span dir="ltr"><Icon name="phone" size={13} />{beneficiary.phone || "No phone"}</span>
                {beneficiary.address && <span><Icon name="mapPin" size={13} />{beneficiary.address}</span>}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>Print Statement</Button>
          <Button icon="plus" onClick={() => setPayOpen(true)}>Pay Beneficiary</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={dueNum < 0 ? "Beneficiary owes factory (advance)" : "Factory owes beneficiary"}
          value={dueNum > 0 ? balanceText(balance) : dueNum < 0 ? balanceText(balance, "credit") : "$0.00"}
          tone={dueNum > 0 ? "bad" : "good"}
          sub={dueNum > 0 ? "Unpaid purchases minus later payments" : dueNum < 0 ? "Paid in advance — they owe us" : "Settled — nothing owed"}
        />
        <StatCard label="Total bought" value={`$${fmtMoney(totals?.totalPurchases ?? 0)}`} sub={`${totals?.purchasesCount ?? 0} purchase(s)`} />
        <StatCard
          label="Total paid"
          value={`$${fmtMoney(totals?.totalPaid ?? 0)}`}
          sub={`$${fmtMoney(totals?.paidAtPurchase ?? 0)} at purchase · $${fmtMoney(totals?.paidLater ?? 0)} later`}
        />
        <StatCard label="Total weight" value={`${fmtMoney(totals?.totalWeight ?? 0)} kg`} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="seg" role="tablist" aria-label="Account view">
            <button role="tab" aria-selected={tab === "statement"} className={tab === "statement" ? "on" : ""} onClick={() => setTab("statement")}>
              Account statement
            </button>
            <button role="tab" aria-selected={tab === "purchases"} className={tab === "purchases" ? "on" : ""} onClick={() => setTab("purchases")}>
              Purchases ({beneficiary.purchases.length})
            </button>
          </div>
        </div>

        {tab === "statement" ? (
          <AccountStatement rows={ledger} side="beneficiary" onUndoPayment={(r) => setUndoing(r)} />
        ) : beneficiary.purchases.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">No purchases recorded yet.</p>
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
                  <th className="text-right">Due at purchase</th>
                </tr>
              </thead>
              <tbody>
                {beneficiary.purchases.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="code code-strong">{p.number}</span></td>
                    <td>{fmtDate(p.txDate)}</td>
                    <td>
                      <span className="block">{p.productName}</span>
                      <span className="code text-muted text-xs">{p.sku}</span>
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(p.weightKg)} kg</td>
                    <td className="text-right tabular-nums">{money(p.unitPrice, p.currency)}</td>
                    <td className="text-right tabular-nums">{money(p.totalPrice, p.currency)}</td>
                    <td className="text-right tabular-nums">{money(p.cashPaid, p.currency)}</td>
                    <td className={`text-right tabular-nums ${Number(p.dueAmount) > 0 ? "text-[#D93025] font-semibold" : ""}`}>
                      {money(p.dueAmount, p.currency)}
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
          <div className="p-3 rounded-lg bg-[#E8F0FB] text-sm flex items-center justify-between gap-3">
            <span>
              Factory owes beneficiary: <strong className={dueNum > 0 ? "text-[#D93025]" : ""}>{dueNum > 0 ? balanceText(balance) : "$0.00"}</strong>
            </span>
            {owedInPayCurrency > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0"
                onClick={() => setPayForm({ ...payForm, amount: String(Math.round(owedInPayCurrency * 100) / 100) })}
              >
                Pay {payForm.currency} in full
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Paid in</span>
              <select value={payForm.currency} onChange={(e) => setPayForm({ ...payForm, currency: e.target.value, vaultCurrency: e.target.value })} className="inp">
                <option value="USD">USD</option>
                <option value="IQD">IQD</option>
              </select>
            </label>
            <label className="block">
              <span className="lbl">Take from vault</span>
              <select value={payForm.vaultCurrency} onChange={(e) => setPayForm({ ...payForm, vaultCurrency: e.target.value })} className="inp">
                <option value="USD">USD Vault</option>
                <option value="IQD">IQD Vault</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="lbl">Amount paid *</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              className="inp"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Date</span>
              <input type="date" value={payForm.payDate} onChange={(e) => setPayForm({ ...payForm, payDate: e.target.value })} className="inp" />
            </label>
            <label className="block">
              <span className="lbl">Notes</span>
              <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="inp" placeholder="e.g. cash, bank transfer" />
            </label>
          </div>
          <ImpactList items={payImpact} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setPayOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>Record Payment</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!undoing}
        onClose={() => setUndoing(null)}
        onConfirm={undoPayment}
        danger
        busy={busy}
        title="Undo Payment"
        confirmLabel="Undo Payment"
        message={
          undoing
            ? `Undo payment ${undoing.reference} of ${money(undoing.paid, undoing.currency)}?\n\n` +
              `• The money goes back into the vault.\n• The factory will owe ${beneficiary.fullName} this amount again.\n\nThis action cannot be undone.`
            : ""
        }
      />
    </div>
  );
}
