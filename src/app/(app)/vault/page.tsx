"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, StatCard, Badge, Skeleton, Pagination, Button, Money } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { fmtDateTime, fmtMoney } from "@/lib/money";

interface VaultTx {
  id: string;
  vaultCurrency: string;
  type: string;
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

  return (
    <div className="space-y-5">
      <div className="page-head">
        <div>
          <h1 className="page-title">Vault</h1>
          <p className="page-sub">Dual-currency cash position and every movement</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="success"
            icon="plus"
            onClick={() => { setOpType("DEPOSIT"); setOpForm({ ...opForm, vaultCurrency: "USD" }); setOpOpen(true); }}
          >
            Deposit
          </Button>
          <Button variant="danger" icon="minus" onClick={() => { setOpType("WITHDRAW"); setOpForm({ ...opForm, vaultCurrency: "USD" }); setOpOpen(true); }}>
            Withdraw
          </Button>
        </div>
      </div>

      {/* Exchange rate — a working figure, not a banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[13.5px] text-muted">
          Today's rate: <strong className="text-[var(--text)] tabular">1 USD = {fmtMoney(data?.exchangeRate ?? 0)} IQD</strong>
        </p>
        <Button variant="secondary" className="btn-sm" onClick={() => { setNewRate(String(data?.exchangeRate ?? "")); setRateOpen(true); }}>
          Edit rate
        </Button>
      </div>

      {/* Vault cards — ruled mill-ticket style */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">USD vault</p>
            <Badge kind="blue">Primary</Badge>
          </div>
          <p className={`mt-2.5 text-[30px] font-bold tracking-[-0.02em] tabular ${Number(usd?.balance) < 0 ? "text-danger" : "text-[var(--text)]"}`}>
            ${fmtMoney(usd?.balance ?? 0)}
            {Number(usd?.balance) < 0 && <span className="unit text-danger font-semibold">deficit</span>}
          </p>
          <div className="divider my-4" />
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="text-faint">Paid in, all time</p>
              <p className="font-semibold text-success tabular">${fmtMoney(usd?.totalIn ?? 0)}</p>
            </div>
            <div>
              <p className="text-faint">Paid out, all time</p>
              <p className="font-semibold text-danger tabular">${fmtMoney(usd?.totalOut ?? 0)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold">IQD vault</p>
            <Badge kind="gray">Secondary</Badge>
          </div>
          <p className={`mt-2.5 text-[30px] font-bold tracking-[-0.02em] tabular ${Number(iqd?.balance) < 0 ? "text-danger" : "text-[var(--text)]"}`}>
            {fmtMoney(iqd?.balance ?? 0)}
            <span className="unit">IQD</span>
            {Number(iqd?.balance) < 0 && <span className="unit text-danger font-semibold">deficit</span>}
          </p>
          <div className="divider my-4" />
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="text-faint">Paid in, all time</p>
              <p className="font-semibold text-success tabular">{fmtMoney(iqd?.totalIn ?? 0, "IQD")}</p>
            </div>
            <div>
              <p className="text-faint">Paid out, all time</p>
              <p className="font-semibold text-danger tabular">{fmtMoney(iqd?.totalOut ?? 0, "IQD")}</p>
            </div>
          </div>
        </Card>
      </div>

      <p className="text-[13px] text-muted">
        Both vaults together are worth <strong className="text-[var(--text)] tabular">${fmtMoney(data?.usdEquivalent ?? 0)}</strong> at the current rate.
      </p>

      {/* History */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">Vault Transaction History</h2>
          <select value={vaultFilter} onChange={(e) => { setVaultFilter(e.target.value); setPage(1); }} className="inp max-w-[160px]">
            <option value="">All vaults</option>
            <option value="USD">USD vault</option>
            <option value="IQD">IQD vault</option>
          </select>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : data.transactions.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-6 text-center">No transactions recorded yet.</p>
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
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx: VaultTx) => (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(tx.txDate)}</td>
                    <td><Badge kind={tx.type.includes("REVERSAL") ? "orange" : "gray"}>{tx.type.replaceAll("_", " ").toLowerCase()}</Badge></td>
                    <td>{tx.reference ? <span className="code">{tx.reference}</span> : <span className="text-faint">—</span>}</td>
                    <td className="max-w-[280px] truncate" title={tx.description}>{tx.description}</td>
                    <td className="num text-success">
                      {Number(tx.amountIn) > 0 ? `${tx.vaultCurrency === "USD" ? "$" : ""}${fmtMoney(tx.amountIn, tx.vaultCurrency)}` : "—"}
                    </td>
                    <td className="num text-danger">
                      {Number(tx.amountOut) > 0 ? `${tx.vaultCurrency === "USD" ? "$" : ""}${fmtMoney(tx.amountOut, tx.vaultCurrency)}` : "—"}
                    </td>
                    <td className="num font-semibold">
                      {tx.vaultCurrency === "USD" ? "$" : ""}{fmtMoney(tx.balanceAfter, tx.vaultCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && data && (
          <Pagination page={page} pageSize={pageSize} total={data.total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
        )}
      </Card>

      {/* Deposit / Withdraw modal */}
      <Modal open={opOpen} onClose={() => setOpOpen(false)} title={opType === "DEPOSIT" ? "Deposit" : "Withdraw"}>
        <form onSubmit={submitOp} className="space-y-4">
          <label className="block">
            <span className="lbl">Vault *</span>
            <select value={opForm.vaultCurrency} onChange={(e) => setOpForm({ ...opForm, vaultCurrency: e.target.value })} className="inp">
              <option value="USD">USD Vault</option>
              <option value="IQD">IQD Vault</option>
            </select>
          </label>
          <label className="block">
            <span className="lbl">Amount *</span>
            <input type="number" step="0.01" min="0.01" required value={opForm.amount} onChange={(e) => setOpForm({ ...opForm, amount: e.target.value })} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">{opType === "DEPOSIT" ? "Source *" : "Reason *"} </span>
            <input required value={opForm.label} onChange={(e) => setOpForm({ ...opForm, label: e.target.value })} className="inp" placeholder={opType === "DEPOSIT" ? "Cash deposit, bank transfer…" : "Operating expense, supplier payment…"} />
          </label>
          <label className="block">
            <span className="lbl">Date</span>
            <input type="date" value={opForm.opDate} onChange={(e) => setOpForm({ ...opForm, opDate: e.target.value })} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Notes</span>
            <input value={opForm.notes} onChange={(e) => setOpForm({ ...opForm, notes: e.target.value })} className="inp" />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{opType === "DEPOSIT" ? "Deposit" : "Withdraw"}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit exchange rate modal */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="Edit Exchange Rate">
        <form onSubmit={saveRate} className="space-y-4">
          <label className="block">
            <span className="lbl">1 USD = ? IQD *</span>
            <input type="number" step="0.01" min="0.01" required value={newRate} onChange={(e) => setNewRate(e.target.value)} className="inp" />
          </label>
          <p className="text-xs text-[#6B7280]">Every rate change is logged with a timestamp in Settings → Rate History.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setRateOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>Save Rate</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
