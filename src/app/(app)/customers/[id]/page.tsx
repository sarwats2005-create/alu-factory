"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, StatCard, Badge, Skeleton, Button, BackLink } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { AccountStatement, ImpactList, Term, balanceText, money, type Balance, type Impact, type LedgerRow } from "@/components/Accounting";
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
  const [balance, setBalance] = useState<Balance | null>(null);
  const [totals, setTotals] = useState<any>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [tab, setTab] = useState<"statement" | "invoices">("statement");
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", currency: "USD", vaultCurrency: "USD", notes: "", payDate: new Date().toISOString().slice(0, 10) });
  const [undoing, setUndoing] = useState<LedgerRow | null>(null);
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
      const res = await fetch(`/api/customers/${id}/payments`, {
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
      const res = await fetch(`/api/customers/${id}/payments?paymentId=${undoing.paymentId}`, { method: "DELETE" });
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

  function exportCsv() {
    const rows = [["Date", "Reference", "Description", "Currency", "Invoiced", "Paid", "Balance"]];
    for (const r of ledger) {
      rows.push([fmtDate(r.date), r.reference, r.description, r.currency, r.charge, r.paid, r.balance]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `customer-${customer?.fullName.replace(/\s+/g, "-")}-statement.csv`;
    a.click();
  }

  if (loading) return <Skeleton rows={8} />;
  if (!customer) return <p className="text-sm text-muted">Customer not found.</p>;

  const dueNum = Number(balance?.usdEquivalent ?? 0);
  const owedInPayCurrency = Number(balance?.[payForm.currency as "USD" | "IQD"] ?? 0);
  const payAmount = Number(payForm.amount) || 0;
  const cross = payForm.currency !== payForm.vaultCurrency;

  const payImpact: Impact[] = [];
  if (payAmount > 0) {
    payImpact.push({
      icon: "wallet",
      tone: "in",
      text: (
        <>
          <strong>{money(payAmount, payForm.currency)}</strong> goes into the <strong>{payForm.vaultCurrency} vault</strong>
          {cross && " (converted at today's exchange rate)"}.
        </>
      ),
    });
    const after = owedInPayCurrency - payAmount;
    payImpact.push(
      after > 0.004
        ? { icon: "users", text: <>{customer.fullName} will still owe <strong>{money(after, payForm.currency)}</strong>.</> }
        : after < -0.004
        ? {
            icon: "alert",
            tone: "warn",
            text: <>This is <strong>{money(-after, payForm.currency)}</strong> more than they owe in {payForm.currency}. The extra is kept as a <Term k="credit">credit</Term> for future invoices.</>,
          }
        : { icon: "check", tone: "in", text: <>{customer.fullName}'s {payForm.currency} balance will be fully <strong>settled</strong>.</> }
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href="/customers">Customers</BackLink>
          <div className="flex items-center gap-3">
            {customer.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={customer.photo} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <span className="w-14 h-14 rounded-full bg-[#E8F0FB] text-[#1B5DB1] flex items-center justify-center text-lg font-bold">
                {customer.fullName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="page-title">{customer.fullName}</h1>
              <p className="entity-meta">
                <span dir="ltr"><Icon name="phone" size={13} />{customer.phone || "No phone"}</span>
                {customer.address && <span><Icon name="mapPin" size={13} />{customer.address}</span>}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="secondary" icon="download" onClick={exportCsv}>Export CSV</Button>
          <Button variant="secondary" icon="printer" onClick={() => window.print()}>Print Statement</Button>
          <Button icon="plus" onClick={() => setPayOpen(true)}>Receive Payment</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={dueNum < 0 ? "Customer credit (paid ahead)" : "Customer owes factory"}
          value={dueNum > 0 ? balanceText(balance) : dueNum < 0 ? balanceText(balance, "credit") : "$0.00"}
          tone={dueNum > 0 ? "bad" : "good"}
          sub={dueNum > 0 ? "Unpaid invoices minus later payments" : dueNum < 0 ? "Credit — paid in advance" : "Settled — nothing owed"}
        />
        <StatCard
          label="Total invoiced"
          value={`$${fmtMoney(totals?.totalSales ?? 0)}`}
          sub={`${totals?.salesCount ?? 0} invoice${totals?.salesCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Total paid"
          value={`$${fmtMoney(totals?.totalCash ?? 0)}`}
          sub={`$${fmtMoney(totals?.cashAtSale ?? 0)} at sale · $${fmtMoney(totals?.paidLater ?? 0)} later`}
        />
        <StatCard
          label="Profit from this customer"
          value={`$${fmtMoney(totals?.profit ?? 0)}`}
          tone={Number(totals?.profit ?? 0) >= 0 ? "good" : "bad"}
          sub={`Invoiced − cost of metal sold ($${fmtMoney(totals?.cogs ?? 0)})`}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="seg" role="tablist" aria-label="Account view">
            <button role="tab" aria-selected={tab === "statement"} className={tab === "statement" ? "on" : ""} onClick={() => setTab("statement")}>
              Account statement
            </button>
            <button role="tab" aria-selected={tab === "invoices"} className={tab === "invoices" ? "on" : ""} onClick={() => setTab("invoices")}>
              Invoices ({customer.sales.length})
            </button>
          </div>
        </div>

        {tab === "statement" ? (
          <AccountStatement rows={ledger} side="customer" onUndoPayment={(r) => setUndoing(r)} />
        ) : customer.sales.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">No sales recorded for this customer yet.</p>
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
                  <th className="text-right">Due at sale</th>
                  <th>Vault</th>
                </tr>
              </thead>
              <tbody>
                {customer.sales.map((s: SaleRow) => (
                  <tr key={s.id}>
                    <td><span className="code code-strong">{s.invoiceNo}</span></td>
                    <td>{fmtDate(s.saleDate)}</td>
                    <td className="text-muted text-sm">
                      {s.lineItems.map((li) => `${li.item.name} (${li.weightKg} kg)`).join(", ")}
                    </td>
                    <td className="text-right tabular-nums">{money(s.totalAmount, s.currency)}</td>
                    <td className="text-right tabular-nums">{money(s.cashPaid, s.currency)}</td>
                    <td className={`text-right tabular-nums ${Number(s.dueAmount) > 0 ? "text-[#D93025] font-semibold" : ""}`}>
                      {money(s.dueAmount, s.currency)}
                    </td>
                    <td><Badge kind="blue">{s.vaultCurrency}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] text-muted mt-3">
              "Due at sale" is what was left unpaid when the invoice was made. Later payments are shown in the account statement.
            </p>
          </div>
        )}
      </Card>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Receive Payment">
        <form onSubmit={submitPayment} className="space-y-4">
          <div className="p-3 rounded-lg bg-[#E8F0FB] text-sm flex items-center justify-between gap-3">
            <span>
              Customer owes factory: <strong className={dueNum > 0 ? "text-[#D93025]" : ""}>{dueNum > 0 ? balanceText(balance) : "$0.00"}</strong>
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
              <span className="lbl">Put into vault</span>
              <select value={payForm.vaultCurrency} onChange={(e) => setPayForm({ ...payForm, vaultCurrency: e.target.value })} className="inp">
                <option value="USD">USD Vault</option>
                <option value="IQD">IQD Vault</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="lbl">Amount received *</span>
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
              `• The money is taken back out of the vault.\n• ${customer.fullName} will owe this amount again.\n\nThis action cannot be undone.`
            : ""
        }
      />
    </div>
  );
}
