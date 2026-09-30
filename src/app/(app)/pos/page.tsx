"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Badge, Button, Skeleton, Pagination, EmptyState } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { Icon } from "@/components/icons";
import { ImpactList, type Impact } from "@/components/Accounting";
import SpecularButton from "@/components/SpecularButton";
import { InvoicePreview } from "@/components/Invoice";
import { toast } from "@/components/Toast";
import { fmtDate, fmtMoney } from "@/lib/money";

/** Invoices can be edited only within 24h of creation (also enforced server-side). */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
function editWindowOpen(sale: { createdAt?: string | Date }): boolean {
  if (!sale.createdAt) return false;
  const created = new Date(sale.createdAt).getTime();
  return Number.isFinite(created) && Date.now() - created < EDIT_WINDOW_MS;
}

interface LineItem {
  key: number;
  itemId: string;
  weightKg: string;
  unitPrice: string;
  saleType: string;
}

export default function PosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  // List view vs builder
  const [view, setView] = useState<"builder" | "list">(editId ? "builder" : "builder");
  const [sales, setSales] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [customers, setCustomers] = useState<{ id: string; fullName: string; due: string }[]>([]);
  const [items, setItems] = useState<{ id: string; name: string; sku: string; available: string }[]>([]);
  const [form, setForm] = useState({ customerId: "", currency: "USD", vaultCurrency: "USD", cashPaid: "", saleDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [lines, setLines] = useState<LineItem[]>([]);
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // Customers + inventory (with real ids — /api/inventory/options has no
      // ids, so it is useless for the <select key={i.id}> and was redundant).
      const [cRes, invRes] = await Promise.all([
        fetch("/api/customers?pageSize=100"),
        fetch("/api/inventory?pageSize=100"),
      ]);
      const c = await cRes.json();
      const inv = await invRes.json();
      setCustomers(c.rows || []);
      setItems(
        (inv.rows || [])
          .filter((x: any) => Number(x.available) > 0)
          .map((x: any) => ({ id: x.id, name: x.name, sku: x.sku, available: x.available }))
      );
    })();
  }, []);

  // Load for edit
  useEffect(() => {
    if (!editId) {
      setEditingInvoice(null);
      return;
    }
    (async () => {
      const res = await fetch(`/api/sales/by-id?id=${editId}`);
      const data = await res.json();
      if (res.ok) {
        const s = data.sale;
        setEditingInvoice(s.invoiceNo);
        setForm({
          customerId: s.customerId,
          currency: s.currency,
          vaultCurrency: s.vaultCurrency,
          cashPaid: String(s.cashPaid),
          saleDate: new Date(s.saleDate).toISOString().slice(0, 10),
          notes: s.notes || "",
        });
        setLines(
          s.lineItems.map((li: any, idx: number) => ({
            key: idx + 1,
            itemId: li.itemId,
            weightKg: String(li.weightKg),
            unitPrice: String(li.unitPrice),
            saleType: li.saleType,
          }))
        );
      }
    })();
  }, [editId]);

  const loadList = useCallback(async () => {
    if (view !== "list") return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sales?page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      setSales(data.sales || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [view, page, pageSize]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const invoiceTotal = lines.reduce((acc, l) => acc + (Number(l.weightKg) || 0) * (Number(l.unitPrice) || 0), 0);
  const dueAmount = invoiceTotal - (Number(form.cashPaid) || 0);
  const crossCurrency = form.currency !== form.vaultCurrency;

  function addLine() {
    setLines([...lines, { key: Date.now(), itemId: "", weightKg: "", unitPrice: "", saleType: "RAW" }]);
  }

  function updateLine(key: number, patch: Partial<LineItem>) {
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: number) {
    setLines(lines.filter((l) => l.key !== key));
  }

  function useMax(key: number, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (item) updateLine(key, { weightKg: String(Number(item.available)) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lines.length) {
      toast("Add at least one line item.", "error");
      return;
    }
    const invalid = lines.find((l) => !l.itemId || !l.weightKg || !l.unitPrice);
    if (invalid) {
      toast("Complete all line items (product, weight, price).", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(editId ? "/api/sales" : "/api/sales", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId || undefined,
          ...form,
          lineItems: lines.map((l) => ({ itemId: l.itemId, weightKg: l.weightKg, unitPrice: l.unitPrice, saleType: l.saleType })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Sale failed", "error");
        return;
      }
      // Fetch full sale for invoice preview
      const full = await fetch(`/api/sales/by-id?id=${data.sale.id}`);
      const fullData = await full.json();
      setInvoice(fullData.sale);
      toast(editId ? "Sale updated." : "Sale recorded — invoice generated.", "success");
      // Reset builder
      setLines([]);
      setForm({ customerId: "", currency: "USD", vaultCurrency: "USD", cashPaid: "", saleDate: new Date().toISOString().slice(0, 10), notes: "" });
      router.replace("/pos");
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sales?id=${deleting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Delete failed", "error");
      else {
        toast("Sale deleted — inventory and vault restored.", "success");
        loadList();
      }
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  const money = (n: number) => (form.currency === "IQD" ? `${fmtMoney(n, "IQD")} IQD` : `$${fmtMoney(n)}`);
  const selectedCustomer = customers.find((c) => c.id === form.customerId);
  const paidPct = invoiceTotal > 0 ? Math.min(100, ((Number(form.cashPaid) || 0) / invoiceTotal) * 100) : 0;
  const cashNum = Number(form.cashPaid) || 0;
  const overpaid = cashNum > invoiceTotal + 0.004;

  // Plain-language preview of every effect this sale will have.
  const impact: Impact[] = [];
  const kgByItem = new Map<string, number>();
  for (const l of lines) if (l.itemId) kgByItem.set(l.itemId, (kgByItem.get(l.itemId) ?? 0) + (Number(l.weightKg) || 0));
  for (const [itemId, kg] of kgByItem) {
    const it = items.find((i) => i.id === itemId);
    if (!it || kg <= 0) continue;
    const left = Number(it.available) - kg;
    // While editing, this invoice's own weight is still counted as sold, so
    // stock figures would be misleading — the server re-checks either way.
    if (editId) {
      impact.push({ icon: "box", tone: "out", text: <><strong>{fmtMoney(kg)} kg</strong> of {it.name} will be on this invoice.</> });
      continue;
    }
    impact.push(
      left < 0
        ? { icon: "box", tone: "warn", text: <>Only <strong>{fmtMoney(it.available)} kg</strong> of {it.name} in stock — reduce the weight by {fmtMoney(-left)} kg.</> }
        : { icon: "box", tone: "out", text: <><strong>{fmtMoney(kg)} kg</strong> of {it.name} leaves stock ({fmtMoney(left)} kg left).</> }
    );
  }
  if (cashNum > 0 && !overpaid) {
    impact.push({
      icon: "wallet",
      tone: "in",
      text: <><strong>{money(cashNum)}</strong> goes into the <strong>{form.vaultCurrency} vault</strong>{crossCurrency ? " (converted at today's rate)" : ""}.</>,
    });
  }
  if (selectedCustomer && invoiceTotal > 0 && !overpaid) {
    const before = Number(selectedCustomer.due) || 0;
    impact.push(
      dueAmount > 0.004
        ? { icon: "users", text: <>{selectedCustomer.fullName} will owe <strong>{money(dueAmount)}</strong> more on this invoice{before > 0 ? <> (on top of ${fmtMoney(before)} already owed)</> : null}.</> }
        : { icon: "check", tone: "in", text: <>Fully paid — {selectedCustomer.fullName} owes nothing on this invoice.</> }
    );
  }

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {editingInvoice ? `Editing invoice ${editingInvoice}` : "Point of Sale"}
          </h1>
          <p className="page-sub">Build the sale, take payment, invoice instantly</p>
        </div>
        {/* A view switch, not two actions — rendered as a segmented control. */}
        <div className="seg" role="tablist" aria-label="Point of sale view">
          <button role="tab" aria-selected={view === "builder"} className={view === "builder" ? "on" : ""} onClick={() => { setView("builder"); router.replace("/pos"); }}>
            <Icon name="plus" size={14} />
            New Sale
          </button>
          <button role="tab" aria-selected={view === "list"} className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
            <Icon name="file" size={14} />
            Sales History
          </button>
        </div>
      </div>

      {view === "builder" ? (
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Card className="p-5">
          <form onSubmit={submit} id="pos-form">
            <section className="form-section">
              <h2 className="form-section-title"><span className="step">1</span>Customer</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="lbl">Customer *</span>
                  <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="inp">
                    <option value="">Select customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} {Number(c.due) > 0 ? `— owes $${fmtMoney(c.due)}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && Number(selectedCustomer.due) > 0 && (
                    <span className="field-hint !text-[var(--warn)]">Already owes ${fmtMoney(selectedCustomer.due)} from earlier invoices.</span>
                  )}
                </label>
                <label className="block">
                  <span className="lbl">Date</span>
                  <input type="date" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} className="inp" />
                </label>
              </div>
            </section>

            <section className="form-section">
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="form-section-title !mb-0"><span className="step">2</span>Products</h2>
                {lines.length > 0 && (
                  <button type="button" onClick={addLine} className="btn btn-secondary btn-sm">
                    <Icon name="plus" size={14} />
                    Add Line Item
                  </button>
                )}
              </div>

              {lines.length === 0 && (
                <button type="button" onClick={addLine} className="line-empty">
                  <span className="line-empty-icon"><Icon name="box" size={20} /></span>
                  <span className="font-semibold text-[var(--text)]">Add the first product</span>
                  <span className="text-[12.5px] text-muted">Pick from inventory, enter weight and price — totals update live.</span>
                </button>
              )}

              <div className="space-y-3">
                {lines.map((l, idx) => {
                  const lineTotal = (Number(l.weightKg) || 0) * (Number(l.unitPrice) || 0);
                  return (
                    <div key={l.key} className="line-card">
                      <div className="flex items-center gap-2">
                        <span className="line-num">{idx + 1}</span>
                        <select
                          required
                          value={l.itemId}
                          onChange={(e) => updateLine(l.key, { itemId: e.target.value })}
                          className="inp flex-1 min-w-0"
                          aria-label={`Product for line ${idx + 1}`}
                        >
                          <option value="">Select product…</option>
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.sku}) — {fmtMoney(i.available)} kg
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => removeLine(l.key)} className="btn btn-ghost btn-sm is-danger !px-2" aria-label={`Remove line ${idx + 1}`} title="Remove line">
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                        <label className="block">
                          <span className="lbl text-xs">Weight (kg)</span>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={l.weightKg}
                              onChange={(e) => updateLine(l.key, { weightKg: e.target.value })}
                              className="inp"
                            />
                            <SpecularButton
                              type="button"
                              size="sm"
                              radius={8}
                              className="whitespace-nowrap"
                              onClick={() => useMax(l.key, l.itemId)}
                              disabled={!l.itemId}
                              title="Fill maximum available weight"
                            >
                              MAX
                            </SpecularButton>
                          </div>
                        </label>
                        <label className="block">
                          <span className="lbl text-xs">Unit Price</span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0.0001"
                            required
                            value={l.unitPrice}
                            onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                            className="inp"
                          />
                        </label>
                        <label className="block">
                          <span className="lbl text-xs">Sale Type</span>
                          <select value={l.saleType} onChange={(e) => updateLine(l.key, { saleType: e.target.value })} className="inp">
                            <option value="RAW">Raw by Weight</option>
                            <option value="FINISHED">Finished Product</option>
                          </select>
                        </label>
                        <div className="text-end">
                          <span className="lbl text-xs">Line Total</span>
                          <p className="font-bold tabular-nums py-2 text-[15px]">
                            {form.currency === "IQD" ? `${fmtMoney(lineTotal, "IQD")}` : `$${fmtMoney(lineTotal)}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="form-section">
              <label className="block">
                <span className="lbl">Notes</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp min-h-[56px]" placeholder="Optional — printed on the invoice record" />
              </label>
            </section>
          </form>
        </Card>

        {/* Payment rail — running total always in view (the "anchor" for every decision). */}
        <Card className="p-5 lg:sticky lg:top-6 space-y-4">
          <h2 className="section-title">Payment</h2>

          <div className="p-4 rounded-lg bg-[#E8F0FB]">
            <p className="text-xs text-muted uppercase font-semibold tracking-wide">Invoice Total</p>
            <p className="text-[28px] font-bold text-[#1B5DB1] tabular-nums leading-tight mt-0.5">{money(invoiceTotal)}</p>
            <p className="text-xs text-muted mt-1">{lines.length} line item{lines.length === 1 ? "" : "s"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="lbl">Currency</span>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="inp">
                <option value="USD">USD</option>
                <option value="IQD">IQD</option>
              </select>
            </label>
            <label className="block">
              <span className="lbl">Vault</span>
              <select value={form.vaultCurrency} onChange={(e) => setForm({ ...form, vaultCurrency: e.target.value })} className="inp">
                <option value="USD">USD Vault</option>
                <option value="IQD">IQD Vault</option>
              </select>
            </label>
          </div>

          {crossCurrency && (
            <div className="p-3 rounded-lg bg-[var(--warn-50)] border border-[var(--warn)]/30 text-[12.5px] text-[var(--warn)]">
              Currency mismatch: exchange rate will be applied automatically when converting into the {form.vaultCurrency} vault.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="pos-cash" className="lbl !mb-0">Cash Paid</label>
              {invoiceTotal > 0 && (
                <button
                  type="button"
                  className="text-[12px] font-semibold text-[var(--brand)] hover:underline"
                  onClick={() => setForm({ ...form, cashPaid: String(Math.round(invoiceTotal * 100) / 100) })}
                >
                  Paid in full
                </button>
              )}
            </div>
            <input id="pos-cash" type="number" step="0.01" min="0" value={form.cashPaid} onChange={(e) => setForm({ ...form, cashPaid: e.target.value })} className="inp" placeholder="0.00" />
          </div>

          <div>
            <div className="sum-row"><span>Total</span><strong>{money(invoiceTotal)}</strong></div>
            <div className="sum-row"><span>Cash paid</span><strong>{money(Number(form.cashPaid) || 0)}</strong></div>
            {invoiceTotal > 0 && (
              <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden my-1" aria-hidden="true">
                <div className="h-full bg-[var(--success)] transition-[width] duration-300" style={{ width: `${paidPct}%` }} />
              </div>
            )}
            <div className="sum-row total">
              <span>
                Due
                <span className={`block text-[11.5px] font-medium ${dueAmount > 0 ? "text-danger" : "text-muted"}`}>
                  {dueAmount > 0 ? "Customer owes factory" : "Fully paid"}
                </span>
              </span>
              <strong className={dueAmount > 0 ? "!text-[var(--danger)]" : "!text-[var(--success)]"}>{money(dueAmount)}</strong>
            </div>
          </div>

          {overpaid && (
            <p className="field-hint !text-[var(--danger)] -mt-2" role="alert">
              Cash paid is more than the invoice total. Enter at most {money(invoiceTotal)} — extra money should be recorded as a customer payment.
            </p>
          )}
          <ImpactList items={impact} />

          <Button type="submit" className="w-full" busy={busy} form="pos-form" disabled={lines.length === 0 || overpaid}>
            {editId ? "Update Sale" : "Confirm Sale & Generate Invoice"}
          </Button>
          {lines.length === 0 && <p className="text-xs text-center text-muted -mt-2">Add at least one product to confirm the sale.</p>}
          {editingInvoice && <p className="text-xs text-center text-muted">Editing {editingInvoice} — <button type="button" className="text-[var(--brand)] underline" onClick={() => router.replace("/pos")}>cancel</button></p>}
        </Card>
      </div>
    ) : (
      /* ============ Sales history list ============ */
      <Card className="p-4">
        {loading ? (
          <Skeleton rows={8} />
        ) : sales.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No sales yet"
            message="Select a customer and add products to create your first invoice."
            cta="New Sale"
            onCta={() => setView("builder")}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Cash Paid</th>
                    <th className="text-right">Due</th>
                    <th>Vault</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td><span className="code code-strong">{s.invoiceNo}</span></td>
                      <td>{fmtDate(s.saleDate)}</td>
                      <td><Link className="hover:text-[#1B5DB1]" href={`/customers/${s.customerId}`}>{s.customer.fullName}</Link></td>
                      <td className="text-right tabular-nums">{s.currency === "IQD" ? `${fmtMoney(s.totalAmount, "IQD")} IQD` : `$${fmtMoney(s.totalAmount)}`}</td>
                      <td className="text-right tabular-nums">{s.currency === "IQD" ? `${fmtMoney(s.cashPaid, "IQD")} IQD` : `$${fmtMoney(s.cashPaid)}`}</td>
                      <td className={`text-right tabular-nums ${Number(s.dueAmount) > 0 ? "text-[#D93025] font-semibold" : ""}`}>
                        {s.currency === "IQD" ? `${fmtMoney(s.dueAmount, "IQD")} IQD` : `$${fmtMoney(s.dueAmount)}`}
                      </td>
                      <td><Badge kind="blue">{s.vaultCurrency}</Badge></td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn-ghost btn-sm"
                            onClick={async () => {
                              const full = await fetch(`/api/sales/by-id?id=${s.id}`);
                              const d = await full.json();
                              setInvoice(d.sale);
                            }}
                          >
                            Invoice
                          </button>
                          {editWindowOpen(s) && (
                            <button className="btn-ghost btn-sm" onClick={() => router.push(`/pos?edit=${s.id}`)}>Edit</button>
                          )}
                          <button className="btn-ghost btn-sm is-danger" onClick={() => setDeleting(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
          </>
        )}
      </Card>
    )}

    {renderModals()}

    </div>
  );

  function renderModals() {
    return (
      <>
        {/* Invoice modal */}
        <Modal open={!!invoice} onClose={() => setInvoice(null)} title={`Invoice ${invoice?.invoiceNo ?? ""}`} wide>
          {invoice && <InvoicePreview sale={invoice} />}
        </Modal>

        {/* Delete confirm */}
        <ConfirmDialog
          open={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={doDelete}
          danger
          busy={busy}
          title="Delete Sale"
          confirmLabel="Delete Sale"
          message={`Delete sale ${deleting?.invoiceNo ?? ""}? Inventory and vault effects will be reversed. This action cannot be undone.`}
        />
      </>
    );
  }
}
