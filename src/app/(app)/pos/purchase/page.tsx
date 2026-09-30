"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Badge, BackLink } from "@/components/ui";
import { toast } from "@/components/Toast";
import { ImpactList, type Impact } from "@/components/Accounting";
import { fmtMoney } from "@/lib/money";

interface BenOption {
  id: string;
  fullName: string;
  due?: string;
}

export default function PurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restockSku = searchParams.get("restock") || "";

  const [beneficiaries, setBeneficiaries] = useState<BenOption[]>([]);
  const [skus, setSkus] = useState<{ sku: string; name: string }[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    beneficiaryId: "",
    productName: "",
    sku: "",
    aluminumType: "",
    weightKg: "",
    unitPrice: "",
    currency: "USD",
    vaultCurrency: "USD",
    cashPaid: "",
    txDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    (async () => {
      const [bRes, sRes, tRes] = await Promise.all([
        fetch("/api/beneficiaries?pageSize=100"),
        fetch("/api/inventory/options"),
        fetch("/api/settings/aluminum-types"),
      ]);
      const b = await bRes.json();
      const s = await sRes.json();
      const t = await tRes.json();
      setBeneficiaries((b.rows || []).map((r: any) => ({ id: r.id, fullName: r.fullName, due: r.due })));
      setSkus(s.options || []);
      setTypes((t.types || []).map((x: any) => x.name));
    })();
  }, []);

  // Restock prefill
  useEffect(() => {
    if (restockSku && skus.length) {
      const match = skus.find((s) => s.sku === restockSku);
      if (match) {
        setForm((f) => ({ ...f, sku: match.sku, productName: match.name }));
      }
    }
  }, [restockSku, skus]);

  // Edit prefill
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    (async () => {
      const res = await fetch(`/api/purchases?page=1&pageSize=1`);
      // Fetch the specific purchase from purchases list API
      const res2 = await fetch(`/api/purchases/by-id?id=${editId}`);
      if (res2.ok) {
        const data = await res2.json();
        const p = data.purchase;
        setEditingNumber(p.number);
        setForm({
          beneficiaryId: p.beneficiaryId,
          productName: p.productName,
          sku: p.sku,
          aluminumType: p.aluminumType,
          weightKg: String(p.weightKg),
          unitPrice: String(p.unitPrice),
          currency: p.currency,
          vaultCurrency: p.vaultCurrency,
          cashPaid: String(p.cashPaid),
          txDate: new Date(p.txDate).toISOString().slice(0, 10),
          notes: p.notes || "",
        });
      }
    })();
  }, [searchParams]);

  const total = (Number(form.weightKg) || 0) * (Number(form.unitPrice) || 0);
  const due = total - (Number(form.cashPaid) || 0);
  const crossCurrency = form.currency !== form.vaultCurrency;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, id: editingNumber ? undefined : undefined };
      const res = await fetch(editingNumber ? `/api/purchases?edit=${searchParams.get("edit")}` : "/api/purchases", {
        method: editingNumber ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: searchParams.get("edit") || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Save failed", "error");
        return;
      }
      toast(editingNumber ? "Purchase updated." : "Purchase recorded — stock added.", "success");
      router.push("/inventory");
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setBusy(false);
    }
  }

  const money = (n: number) => (form.currency === "IQD" ? `${fmtMoney(n, "IQD")} IQD` : `$${fmtMoney(n)}`);
  const cashNum = Number(form.cashPaid) || 0;
  const overpaid = cashNum > total + 0.004;
  const ben = beneficiaries.find((b) => b.id === form.beneficiaryId);
  const existingSku = skus.find((x) => x.sku === form.sku.trim());

  // Plain-language preview of every effect this purchase will have.
  const impact: Impact[] = [];
  const kg = Number(form.weightKg) || 0;
  if (kg > 0 && form.sku.trim()) {
    impact.push({
      icon: "box",
      tone: "in",
      text: existingSku
        ? <><strong>{fmtMoney(kg)} kg</strong> is added to existing stock of {existingSku.name} ({existingSku.sku}).</>
        : <>A new inventory item <strong>{form.productName || form.sku}</strong> ({form.sku}) is created with <strong>{fmtMoney(kg)} kg</strong>.</>,
    });
  }
  if (cashNum > 0 && !overpaid) {
    impact.push({
      icon: "wallet",
      tone: "out",
      text: <><strong>{money(cashNum)}</strong> is paid out of the <strong>{form.vaultCurrency} vault</strong>{crossCurrency ? " (converted at today's rate)" : ""}.</>,
    });
  }
  if (ben && total > 0 && !overpaid) {
    impact.push(
      due > 0.004
        ? { icon: "handshake", text: <>The factory will owe {ben.fullName} <strong>{money(due)}</strong> for this purchase{Number(ben.due) > 0 ? <> (on top of ${fmtMoney(ben.due)} already owed)</> : null}.</> }
        : { icon: "check", tone: "in", text: <>Fully paid — nothing is owed to {ben.fullName} for this purchase.</> }
    );
  }

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <BackLink href="/inventory">Inventory</BackLink>
          <h1 className="page-title">{editingNumber ? `Editing Purchase ${editingNumber}` : "New Purchase"}</h1>
          <p className="page-sub">Buy raw material from a beneficiary — stock is added to inventory automatically</p>
        </div>
      </div>

      <form onSubmit={submit} className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <Card className="p-5">
          <section className="form-section">
            <h2 className="form-section-title"><span className="step">1</span>Supplier</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="lbl">Beneficiary *</span>
                <select required value={form.beneficiaryId} onChange={(e) => setForm({ ...form, beneficiaryId: e.target.value })} className="inp">
                  <option value="">Select beneficiary…</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>{b.fullName}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="lbl">Date *</span>
                <input type="date" required value={form.txDate} onChange={(e) => setForm({ ...form, txDate: e.target.value })} className="inp" />
              </label>
            </div>
          </section>

          <section className="form-section">
            <h2 className="form-section-title"><span className="step">2</span>Material</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="lbl">Product Name *</span>
                <input
                  required
                  list="product-names"
                  value={form.productName}
                  onChange={(e) => setForm({ ...form, productName: e.target.value })}
                  className="inp"
                />
                <datalist id="product-names">
                  {skus.map((s) => (
                    <option key={s.sku} value={s.name} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="lbl">SKU Code *</span>
                <input
                  required
                  list="sku-codes"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  className="inp font-mono"
                  dir="ltr"
                />
                <datalist id="sku-codes">
                  {skus.map((s) => (
                    <option key={s.sku} value={s.sku}>{s.name}</option>
                  ))}
                </datalist>
                <span className="field-hint">Pick an existing SKU to restock it, or type a new one.</span>
              </label>
              <label className="block sm:col-span-2">
                <span className="lbl">Aluminum Type *</span>
                <input
                  required
                  list="alu-types"
                  value={form.aluminumType}
                  onChange={(e) => setForm({ ...form, aluminumType: e.target.value })}
                  className="inp"
                />
                <datalist id="alu-types">
                  {types.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>
            </div>
          </section>

          <section className="form-section">
            <h2 className="form-section-title"><span className="step">3</span>Weight &amp; price</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block">
                <span className="lbl">Weight (kg) *</span>
                <input type="number" step="0.01" min="0.01" required value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className="inp" />
              </label>
              <label className="block">
                <span className="lbl">Unit Price *</span>
                <input type="number" step="0.0001" min="0.0001" required value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} className="inp" />
              </label>
              <label className="block">
                <span className="lbl">Currency *</span>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="inp">
                  <option value="USD">USD</option>
                  <option value="IQD">IQD</option>
                </select>
              </label>
            </div>
            <label className="block mt-4">
              <span className="lbl">Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp min-h-[64px]" />
            </label>
          </section>
        </Card>

        {/* Payment rail — the running total stays in view while the form is filled. */}
        <Card className="p-5 lg:sticky lg:top-6 space-y-4">
          <h2 className="section-title">Payment</h2>

          <div className="p-4 rounded-lg bg-[#E8F0FB]">
            <p className="text-xs text-muted uppercase font-semibold tracking-wide">Total price</p>
            <p className="text-[26px] font-bold text-[#1B5DB1] tabular-nums leading-tight mt-0.5">{money(total)}</p>
            <p className="text-xs text-muted mt-1 tabular-nums">
              {fmtMoney(Number(form.weightKg) || 0)} kg × {form.currency === "IQD" ? fmtMoney(Number(form.unitPrice) || 0, "IQD") : `$${fmtMoney(Number(form.unitPrice) || 0)}`}
            </p>
          </div>

          <label className="block">
            <span className="lbl">Pay from vault *</span>
            <select value={form.vaultCurrency} onChange={(e) => setForm({ ...form, vaultCurrency: e.target.value })} className="inp">
              <option value="USD">USD Vault</option>
              <option value="IQD">IQD Vault</option>
            </select>
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="purchase-cash" className="lbl !mb-0">Cash Paid</label>
              {total > 0 && (
                <button type="button" className="text-[12px] font-semibold text-[var(--brand)] hover:underline" onClick={() => setForm({ ...form, cashPaid: String(Math.round(total * 100) / 100) })}>
                  Pay in full
                </button>
              )}
            </div>
            <input id="purchase-cash" type="number" step="0.01" min="0" value={form.cashPaid} onChange={(e) => setForm({ ...form, cashPaid: e.target.value })} className="inp" placeholder="0.00" />
          </div>

          {crossCurrency && (
            <div className="p-3 rounded-lg bg-[var(--warn-50)] border border-[var(--warn)]/30 text-[12.5px] text-[var(--warn)]">
              Exchange rate will be applied automatically: payment of {money(Number(form.cashPaid) || 0)} converts at the current saved rate into the {form.vaultCurrency} vault.
            </div>
          )}

          <div>
            <div className="sum-row"><span>Total</span><strong>{money(total)}</strong></div>
            <div className="sum-row"><span>Cash paid</span><strong>{money(Number(form.cashPaid) || 0)}</strong></div>
            <div className="sum-row total">
              <span>
                Due
                <span className={`block text-[11.5px] font-medium ${due > 0 ? "text-danger" : "text-muted"}`}>
                  {due > 0 ? "Factory owes beneficiary" : "Fully paid"}
                </span>
              </span>
              <strong className={due > 0 ? "!text-[var(--danger)]" : "!text-[var(--success)]"}>{money(due)}</strong>
            </div>
          </div>

          {overpaid && (
            <p className="field-hint !text-[var(--danger)]" role="alert">
              Cash paid is more than the total price. Enter at most {money(total)} — an advance to the supplier should be recorded as a separate payment.
            </p>
          )}
          <ImpactList items={impact} />

          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" busy={busy} className="w-full" disabled={overpaid}>{editingNumber ? "Update Purchase" : "Record Purchase"}</Button>
            <button type="button" onClick={() => router.push("/inventory")} className="btn btn-ghost w-full">Cancel</button>
          </div>
        </Card>
      </form>
    </div>
  );
}
