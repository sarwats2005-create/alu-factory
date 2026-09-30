"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, StatCard, Badge, Skeleton, Pagination, Button, Money, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { ImpactList, type Impact } from "@/components/Accounting";
import { toast } from "@/components/Toast";
import { fmtDateTime, fmtMoney } from "@/lib/money";

interface VaultTx {
  id: string;
  vaultCurrency: string;
  type: string;
  vaultOpId?: string | null;
  reference?: string | null;
  description: string;
  currency: string;
  amountIn: string;
  amountOut: string;
  balanceAfter: string;
  exchangeRate?: string | null;
  txDate: string;
}

export default function VaultPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [vaultFilter, setVaultFilter] = useState("");
  const [opOpen, setOpOpen] = useState(false);
  const [opType, setOpType] = useState<"DEPOSIT" | "WITHDRAW">("DEPOSIT");
  const [opForm, setOpForm] = useState({ vaultCurrency: "USD", amount: "", label: "", notes: "", opDate: new Date().toISOString().slice(0, 10) });
  const [rateOpen, setRateOpen] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [exOpen, setExOpen] = useState(false);
  const [exForm, setExForm] = useState({ fromCurrency: "USD", amount: "", rate: "", notes: "", opDate: new Date().toISOString().slice(0, 10) });
  const [undoing, setUndoing] = useState<VaultTx | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vault?page=${page}&pageSize=${pageSize}&vault=${vaultFilter}`);
      const d = await res.json();
      setData(d);
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, vaultFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitOp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/vault/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opForm, opType }),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Operation failed", "error");
      else {
        toast(`${opType === "DEPOSIT" ? "Deposit" : "Withdrawal"} recorded.`, "success");
        setOpOpen(false);
        setOpForm({ ...opForm, amount: "", label: "", notes: "" });
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitExchange(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/vault/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...exForm, opType: "EXCHANGE" }),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Exchange failed", "error");
      else {
        toast("Exchange recorded.", "success");
        setExOpen(false);
        setExForm({ ...exForm, amount: "", notes: "" });
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function undoOp() {
    if (!undoing?.vaultOpId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/vault/operations?id=${undoing.vaultOpId}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Could not undo", "error");
      else {
        toast("Entry undone — a correcting line was added to the history.", "success");
        load();
      }
    } finally {
      setBusy(false);
      setUndoing(null);
    }
  }

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeRate: newRate }),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Failed to save rate", "error");
      else {
        toast("Exchange rate saved.", "success");
        setRateOpen(false);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Skeleton rows={8} />;

  const usd = data?.vaults?.USD;
  const iqd = data?.vaults?.IQD;
  const openOp = (type: "DEPOSIT" | "WITHDRAW", vaultCurrency: string) => {
    setOpType(type);
    setOpForm({ ...opForm, vaultCurrency });
    setOpOpen(true);
  };
  const opVault = opForm.vaultCurrency === "IQD" ? iqd : usd;
  const fmtC = (c: string, n: number) => (c === "IQD" ? `${fmtMoney(n, "IQD")} IQD` : `$${fmtMoney(n)}`);

  const opAmount = Number(opForm.amount) || 0;
  const opImpact: Impact[] = [];
  if (opAmount > 0) {
    const bal = Number(opVault?.balance ?? 0);
    const after = opType === "DEPOSIT" ? bal + opAmount : bal - opAmount;
    opImpact.push({
      icon: "wallet",
      tone: opType === "DEPOSIT" ? "in" : "out",
      text: <>The <strong>{opForm.vaultCurrency} vault</strong> goes from {fmtC(opForm.vaultCurrency, bal)} to <strong>{fmtC(opForm.vaultCurrency, after)}</strong>.</>,
    });
    opImpact.push({
      icon: "alert",
      tone: "neutral",
      text: opType === "DEPOSIT"
        ? <>A deposit is not a sale — it does <strong>not</strong> change profit.</>
        : <>A withdrawal is not linked to a supplier or customer — use <em>Pay Beneficiary</em> for supplier payments so their balance updates.</>,
    });
  }

  const exRate = Number(exForm.rate || data?.exchangeRate || 0);
  const exAmount = Number(exForm.amount) || 0;
  const exTo = exForm.fromCurrency === "USD" ? "IQD" : "USD";
  const exReceived = exRate > 0 ? (exForm.fromCurrency === "USD" ? exAmount * exRate : exAmount / exRate) : 0;
  const exImpact: Impact[] = exAmount > 0 && exRate > 0
    ? [
        { icon: "arrowUpRight", tone: "out", text: <><strong>{fmtC(exForm.fromCurrency, exAmount)}</strong> leaves the {exForm.fromCurrency} vault.</> },
        { icon: "arrowDownRight", tone: "in", text: <><strong>{fmtC(exTo, exReceived)}</strong> goes into the {exTo} vault.</> },
        { icon: "scale2", text: <>An exchange only moves money between your vaults — it is not income or expense.</> },
      ]
    : [];

  const TYPE_LABEL: Record<string, string> = {
    SALE: "Sale — cash received",
    PURCHASE: "Purchase — cash paid",
    DEPOSIT: "Deposit",
    WITHDRAW: "Withdrawal",
    EXCHANGE: "Currency exchange",
    CUSTOMER_PAYMENT: "Payment from customer",
    BENEFICIARY_PAYMENT: "Payment to supplier",
  };
  const typeLabel = (t: string) =>
    t.endsWith("_REVERSAL") ? `Undo: ${(TYPE_LABEL[t.replace("_REVERSAL", "")] ?? t).split(" — ")[0].toLowerCase()}` : TYPE_LABEL[t] ?? t.replaceAll("_", " ").toLowerCase();
  const recon = data?.reconciliation;
  const reconIssues = recon ? (["USD", "IQD"] as const).filter((c) => !recon[c].ok) : [];

  return (
    <div className="space-y-5">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vault</h1>
          <p className="page-sub">Dual-currency cash position and every movement</p>
        </div>
        <div className="flex gap-2">
          <Button icon="plus" onClick={() => openOp("DEPOSIT", "USD")}>
            Deposit
          </Button>
          <Button variant="secondary" icon="minus" onClick={() => openOp("WITHDRAW", "USD")}>
            Withdraw
          </Button>
          <Button variant="secondary" icon="dollar" onClick={() => { setExForm({ ...exForm, rate: String(Number(data?.exchangeRate ?? 0)) }); setExOpen(true); }}>
            Exchange
          </Button>
        </div>
      </div>

      {reconIssues.length > 0 && (
        <div className="p-4 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-50)] text-[13px] leading-relaxed flex items-start gap-3" role="alert">
          <Icon name="alert" size={17} className="text-[var(--warn)] shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[var(--text)]">The vault history does not add up to the balance</p>
            {reconIssues.map((c) => (
              <p key={c} className="text-muted">
                {c} vault: history totals {fmtC(c, Number(recon[c].history))}, but the balance is {fmtC(c, Number(recon[c].balance))} (difference {fmtC(c, Number(recon[c].difference))}).
              </p>
            ))}
            <p className="text-muted mt-1">
              This usually comes from old entries that were deleted instead of reversed (for example test data). The balance itself is still what each
              operation recorded. New deletions always keep the original line and add an undo line, so this gap will not grow.
            </p>
          </div>
        </div>
      )}

      {/* Overview first: the one number owners ask for, then the breakdown. */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 flex flex-col">
          <p className="stat-label !text-[var(--brand)]">Total cash position</p>
          <p className="mt-2 text-[32px] font-bold tracking-[-0.02em] tabular text-[var(--text)] leading-tight">
            ${fmtMoney(data?.usdEquivalent ?? 0)}
          </p>
          <p className="text-[12.5px] text-muted mt-1">Both vaults, in USD at the current rate</p>
          <div className="divider my-4" />
          <div className="flex items-center justify-between gap-3 mt-auto">
            <p className="text-[13px] text-muted">
              Rate <strong className="text-[var(--text)] tabular">1 USD = {fmtMoney(data?.exchangeRate ?? 0)} IQD</strong>
            </p>
            <Button variant="ghost" className="btn-sm" icon="edit" onClick={() => { setNewRate(String(data?.exchangeRate ?? "")); setRateOpen(true); }}>
              Edit
            </Button>
          </div>
        </Card>

        {[
          { key: "USD", v: usd, label: "USD vault", badge: <Badge kind="blue">Primary</Badge>, fmt: (n: any) => `$${fmtMoney(n ?? 0)}`, unit: "" },
          { key: "IQD", v: iqd, label: "IQD vault", badge: <Badge kind="gray">Secondary</Badge>, fmt: (n: any) => fmtMoney(n ?? 0, "IQD"), unit: "IQD" },
        ].map(({ key, v, label, badge, fmt, unit }) => (
          <Card key={key} className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold flex items-center gap-2">{label} {badge}</p>
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm !px-2" onClick={() => openOp("DEPOSIT", key)} aria-label={`Deposit to ${label}`} title={`Deposit to ${label}`}>
                  <Icon name="plus" size={15} />
                </button>
                <button className="btn btn-ghost btn-sm !px-2" onClick={() => openOp("WITHDRAW", key)} aria-label={`Withdraw from ${label}`} title={`Withdraw from ${label}`}>
                  <Icon name="minus" size={15} />
                </button>
              </div>
            </div>
            <p className={`mt-2 text-[28px] font-bold tracking-[-0.02em] tabular leading-tight ${Number(v?.balance) < 0 ? "text-danger" : "text-[var(--text)]"}`}>
              {fmt(v?.balance)}
              {unit && <span className="unit">{unit}</span>}
              {Number(v?.balance) < 0 && <span className="unit text-danger font-semibold">deficit</span>}
            </p>
            <div className="divider my-4" />
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <p className="text-muted flex items-center gap-1"><Icon name="arrowDownRight" size={13} className="text-success" />Money in, all time</p>
                <p className="font-semibold text-success tabular">{fmt(v?.totalIn)}</p>
              </div>
              <div>
                <p className="text-muted flex items-center gap-1"><Icon name="arrowUpRight" size={13} className="text-danger" />Money out, all time</p>
                <p className="font-semibold text-danger tabular">{fmt(v?.totalOut)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* History */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="section-title">Transaction History</h2>
          <select value={vaultFilter} onChange={(e) => { setVaultFilter(e.target.value); setPage(1); }} className="inp inp-sm !min-w-[140px]" aria-label="Filter by vault">
            <option value="">All vaults</option>
            <option value="USD">USD vault</option>
            <option value="IQD">IQD vault</option>
          </select>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : data.transactions.length === 0 ? (
          <EmptyState icon="shield" title="No transactions yet" message="Deposits, withdrawals, sales and purchases will appear here as they happen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="text-right">In</th>
                  <th className="text-right">Out</th>
                  <th className="text-right">Balance After</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx: VaultTx) => (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(tx.txDate)}</td>
                    <td><Badge kind={tx.type.includes("REVERSAL") ? "orange" : Number(tx.amountIn) > 0 ? "green" : "gray"}>{typeLabel(tx.type)}</Badge></td>
                    <td>{tx.reference ? <span className="code">{tx.reference}</span> : <span className="text-faint">—</span>}</td>
                    <td className="max-w-[280px] truncate" title={tx.description}>{tx.description}</td>
                    <td className="num text-success">
                      {Number(tx.amountIn) > 0 ? `+${tx.vaultCurrency === "USD" ? "$" : ""}${fmtMoney(tx.amountIn, tx.vaultCurrency)}` : <span className="text-faint">—</span>}
                    </td>
                    <td className="num text-danger">
                      {Number(tx.amountOut) > 0 ? `−${tx.vaultCurrency === "USD" ? "$" : ""}${fmtMoney(tx.amountOut, tx.vaultCurrency)}` : <span className="text-faint">—</span>}
                    </td>
                    <td className="num font-semibold">
                      {tx.vaultCurrency === "USD" ? "$" : ""}{fmtMoney(tx.balanceAfter, tx.vaultCurrency)}
                      {tx.vaultCurrency === "IQD" && <span className="unit">IQD</span>}
                    </td>
                    <td className="text-right">
                      {tx.vaultOpId && ["DEPOSIT", "WITHDRAW", "EXCHANGE"].includes(tx.type) && (
                        <button className="btn btn-ghost btn-sm is-danger" onClick={() => setUndoing(tx)} title="Undo this entry">Undo</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && data && data.transactions.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
        )}
      </Card>

      {/* Deposit / Withdraw modal */}
      <Modal open={opOpen} onClose={() => setOpOpen(false)} title={opType === "DEPOSIT" ? "Deposit" : "Withdraw"}>
        <form onSubmit={submitOp} className="space-y-4">
          <div className="seg w-full" role="radiogroup" aria-label="Vault">
            {["USD", "IQD"].map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={opForm.vaultCurrency === c}
                className={`flex-1 justify-center ${opForm.vaultCurrency === c ? "on" : ""}`}
                onClick={() => setOpForm({ ...opForm, vaultCurrency: c })}
              >
                {c} Vault
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted -mt-2">
            Current balance: <strong className="text-[var(--text)] tabular">{opForm.vaultCurrency === "IQD" ? `${fmtMoney(iqd?.balance ?? 0, "IQD")} IQD` : `$${fmtMoney(usd?.balance ?? 0)}`}</strong>
          </p>
          <label className="block">
            <span className="lbl">Amount *</span>
            <input type="number" step="0.01" min="0.01" required value={opForm.amount} onChange={(e) => setOpForm({ ...opForm, amount: e.target.value })} className="inp" autoFocus />
            {opType === "WITHDRAW" && Number(opForm.amount) > Number(opVault?.balance ?? 0) && (
              <span className="field-hint !text-[var(--warn)]">This is more than the vault holds — the balance will go negative.</span>
            )}
          </label>
          <label className="block">
            <span className="lbl">{opType === "DEPOSIT" ? "Source *" : "Reason *"} </span>
            <input required value={opForm.label} onChange={(e) => setOpForm({ ...opForm, label: e.target.value })} className="inp" placeholder={opType === "DEPOSIT" ? "Cash deposit, bank transfer…" : "Operating expense, supplier payment…"} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Date</span>
              <input type="date" value={opForm.opDate} onChange={(e) => setOpForm({ ...opForm, opDate: e.target.value })} className="inp" />
            </label>
            <label className="block">
              <span className="lbl">Notes</span>
              <input value={opForm.notes} onChange={(e) => setOpForm({ ...opForm, notes: e.target.value })} className="inp" />
            </label>
          </div>
          <ImpactList items={opImpact} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{opType === "DEPOSIT" ? "Deposit" : "Withdraw"}</Button>
          </div>
        </form>
      </Modal>

      {/* Currency exchange between vaults */}
      <Modal open={exOpen} onClose={() => setExOpen(false)} title="Exchange Currency">
        <form onSubmit={submitExchange} className="space-y-4">
          <p className="text-[13px] text-muted -mt-1">Move money from one vault to the other, e.g. when you sell dollars for dinars at a money changer.</p>
          <div className="seg w-full" role="radiogroup" aria-label="Direction">
            {[["USD", "USD → IQD"], ["IQD", "IQD → USD"]].map(([c, label]) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={exForm.fromCurrency === c}
                className={`flex-1 justify-center ${exForm.fromCurrency === c ? "on" : ""}`}
                onClick={() => setExForm({ ...exForm, fromCurrency: c })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Amount to give ({exForm.fromCurrency}) *</span>
              <input type="number" step="0.01" min="0.01" required value={exForm.amount} onChange={(e) => setExForm({ ...exForm, amount: e.target.value })} className="inp" autoFocus />
              <span className="field-hint">
                {exForm.fromCurrency} vault holds {fmtC(exForm.fromCurrency, Number((exForm.fromCurrency === "USD" ? usd : iqd)?.balance ?? 0))}
              </span>
            </label>
            <label className="block">
              <span className="lbl">Rate you got (1 USD = ? IQD) *</span>
              <input type="number" step="0.01" min="0.01" required value={exForm.rate} onChange={(e) => setExForm({ ...exForm, rate: e.target.value })} className="inp" />
              <span className="field-hint">System rate: {fmtMoney(data?.exchangeRate ?? 0)}</span>
            </label>
          </div>
          <div className="p-3 rounded-lg bg-[#E8F0FB] flex items-center justify-between gap-3">
            <span className="text-sm font-medium">You receive</span>
            <span className="text-[20px] font-bold text-[#1B5DB1] tabular">{fmtC(exTo, exReceived)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Date</span>
              <input type="date" value={exForm.opDate} onChange={(e) => setExForm({ ...exForm, opDate: e.target.value })} className="inp" />
            </label>
            <label className="block">
              <span className="lbl">Notes</span>
              <input value={exForm.notes} onChange={(e) => setExForm({ ...exForm, notes: e.target.value })} className="inp" placeholder="e.g. money changer name" />
            </label>
          </div>
          <ImpactList items={exImpact} />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setExOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>Record Exchange</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!undoing}
        onClose={() => setUndoing(null)}
        onConfirm={undoOp}
        danger
        busy={busy}
        title="Undo Vault Entry"
        confirmLabel="Undo Entry"
        message={
          undoing
            ? `Undo "${undoing.description}"?\n\n` +
              (undoing.type === "EXCHANGE"
                ? "Both sides of the exchange are reversed: each vault gets back exactly what it gave or received."
                : `The ${undoing.vaultCurrency} vault balance is corrected by the same amount.`) +
              "\n\nThe original line stays in the history and an undo line is added, so the record stays complete. This action cannot be undone."
            : ""
        }
      />

      {/* Edit exchange rate modal */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="Edit Exchange Rate">
        <form onSubmit={saveRate} className="space-y-4">
          <label className="block">
            <span className="lbl">1 USD = ? IQD *</span>
            <input type="number" step="0.01" min="0.01" required value={newRate} onChange={(e) => setNewRate(e.target.value)} className="inp" />
          </label>
          <p className="text-xs text-muted">Every rate change is logged with a timestamp in Settings → Rate History.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setRateOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>Save Rate</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
