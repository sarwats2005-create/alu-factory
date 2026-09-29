"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Badge, Button, Skeleton, Pagination } from "@/components/ui";
import { Modal } from "@/components/Modal";
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

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {editingInvoice ? `Editing invoice ${editingInvoice}` : "Point of Sale"}
          </h1>
          <p className="page-sub">Build the sale, take payment, invoice instantly</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "builder" ? "primary" : "secondary"} onClick={() => { setView("builder"); router.replace("/pos"); }}>
            New Sale
          </Button>
          <Button variant={view === "list" ? "primary" : "secondary"} onClick={() => setView("list")}>
            Sales History
          </Button>
        </div>
      </div>

      {view === "builder" ? (
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <form onSubmit={submit} id="pos-form" className="space-y-4">
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
                </label>
                <label className="block">
                  <span className="lbl">Date</span>
                  <input type="date" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} className="inp" />
                </label>
              </div>

              <div className="border-t border-[#E2E8F0] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Sale Line Items</h3>
                  <button type="button" onClick={addLine} className="btn-secondary btn-sm">+ Add Line Item</button>
                </div>

                {lines.length === 0 && (
                  <p className="text-sm text-[#6B7280] py-4 text-center">
                    No line items yet. Add a product to begin building the sale.
                  </p>
                )}

                <div className="space-y-3">
                  {lines.map((l) => {
                    const item = items.find((i) => i.id === l.itemId);
                    return (
                      <div key={l.key} className="p-3 border border-[#E2E8F0] rounded-lg space-y-3 bg-[#FAFBFC]">
                        <div className="flex items-center justify-between">
                          <select
                            required
                            value={l.itemId}
                            onChange={(e) => updateLine(l.key, { itemId: e.target.value })}
                            className="inp flex-1 mr-2"
                          >
                            <option value="">Select product…</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.sku}) — {fmtMoney(i.available)} kg
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={() => removeLine(l.key)} className="btn-ghost btn-sm text-[#D93025]" aria-label="Remove line">×</button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                          <div>
                            <span className="lbl text-xs">Line Total</span>
                            <p className="font-semibold tabular-nums py-2">
                              {form.currency === "IQD" ? `${fmtMoney((Number(l.weightKg) || 0) * (Number(l.unitPrice) || 0), "IQD")}` : `$${fmtMoney((Number(l.weightKg) || 0) * (Number(l.unitPrice) || 0))}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>
          </Card>
        </div>

        {/* Summary column */}
        <div className="space-y-4">
          <Card className="p-5 sticky top-4">
            <h3 className="font-semibold mb-3">Payment</h3>
            <div className="space-y-3">
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
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  Currency mismatch: exchange rate will be applied automatically when converting into the {form.vaultCurrency} vault.
                </div>
              )}

              <div className="p-3 rounded-lg bg-[#E8F0FB] text-center">
                <p className="text-xs text-[#6B7280] uppercase font-semibold">Invoice Total</p>
                <p className="text-2xl font-bold text-[#1B5DB1] tabular-nums">
                  {form.currency === "IQD" ? `${fmtMoney(invoiceTotal, "IQD")} IQD` : `$${fmtMoney(invoiceTotal)}`}
                </p>
              </div>

              <label className="block">
                <span className="lbl">Cash Paid</span>
                <input type="number" step="0.01" min="0" value={form.cashPaid} onChange={(e) => setForm({ ...form, cashPaid: e.target.value })} className="inp" />
              </label>

              <div className="p-3 rounded-lg border border-[#E2E8F0]">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Due — Customer owes factory</span>
                  <span className={`font-bold tabular-nums ${dueAmount > 0 ? "text-[#D93025]" : "text-[#1E8A44]"}`}>
                    {form.currency === "IQD" ? `${fmtMoney(dueAmount, "IQD")} IQD` : `$${fmtMoney(dueAmount)}`}
                  </span>
                </div>
                {invoiceTotal > 0 && (
                  <div className="mt-2 h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
                    <div
                      className="h-full bg-[#1E8A44]"
                      style={{ width: `${Math.min(100, ((Number(form.cashPaid) || 0) / invoiceTotal) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              <label className="block">
                <span className="lbl">Notes</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp min-h-[56px]" />
              </label>

              <Button type="submit" className="w-full" busy={busy} form="pos-form">
                {editId ? "Update Sale" : "Confirm Sale & Generate Invoice"}
              </Button>
              {editingInvoice && <p className="text-xs text-center text-[#6B7280]">Editing {editingInvoice} — <button type="button" className="text-[#1B5DB1] underline" onClick={() => router.replace("/pos")}>cancel</button></p>}
            </div>
          </Card>
        </div>
      </div>
    ) : (
      /* ============ Sales history list ============ */
      <Card className="p-4">
        {loading ? (
          <Skeleton rows={8} />
        ) : sales.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-10 text-center">
            No sales yet. Select a customer and add products to create your first invoice.
          </p>
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
                        <div className="flex gap-1">
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
                          <button className="btn-ghost btn-sm text-[#D93025]" onClick={() => setDeleting(s)}>Delete</button>
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
        <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Sale">
          <p className="text-sm whitespace-pre-line">
            {`Delete sale ${deleting?.invoiceNo ?? ""}? Inventory and vault effects will be reversed. This action cannot be undone.`}
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setDeleting(null)} className="btn-secondary">Cancel</button>
            <Button variant="danger" busy={busy} onClick={doDelete}>Delete</Button>
          </div>
        </Modal>
      </>
    );
  }
}
