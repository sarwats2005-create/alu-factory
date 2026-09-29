"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Badge } from "@/components/ui";
import { toast } from "@/components/Toast";
import { fmtMoney } from "@/lib/money";

interface BenOption {
  id: string;
  fullName: string;
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
      setBeneficiaries((b.rows || []).map((r: any) => ({ id: r.id, fullName: r.fullName })));
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

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1A1F36]">
          {editingNumber ? `EDITING PURCHASE ${editingNumber}` : "New Purchase"}
        </h1>
        {editingNumber && <Button variant="secondary" onClick={() => router.push("/inventory")}>Cancel</Button>}
      </div>

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
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
              />
              <datalist id="sku-codes">
                {skus.map((s) => (
                  <option key={s.sku} value={s.sku}>{s.name}</option>
                ))}
              </datalist>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
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
            <label className="block">
              <span className="lbl">Currency *</span>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="inp">
                <option value="USD">USD</option>
                <option value="IQD">IQD</option>
              </select>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="lbl">Weight (kg) *</span>
              <input type="number" step="0.01" min="0.01" required value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className="inp" />
            </label>
            <label className="block">
              <span className="lbl">Unit Price *</span>
              <input type="number" step="0.0001" min="0.0001" required value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} className="inp" />
            </label>
          </div>

          <div className="p-4 rounded-lg bg-[#E8F0FB] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Price (auto-calculated)</span>
              <span className="text-xl font-bold text-[#1B5DB1] tabular-nums">
                {form.currency === "IQD" ? `${fmtMoney(total, "IQD")} IQD` : `$${fmtMoney(total)}`}
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="lbl">Vault *</span>
              <select value={form.vaultCurrency} onChange={(e) => setForm({ ...form, vaultCurrency: e.target.value })} className="inp">
                <option value="USD">USD Vault</option>
                <option value="IQD">IQD Vault</option>
              </select>
            </label>
            <label className="block">
              <span className="lbl">Cash Paid</span>
              <input type="number" step="0.01" min="0" value={form.cashPaid} onChange={(e) => setForm({ ...form, cashPaid: e.target.value })} className="inp" />
            </label>
          </div>

          {crossCurrency && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Exchange rate will be applied automatically: payment of {form.currency === "IQD" ? `${fmtMoney(Number(form.cashPaid) || 0, "IQD")} IQD` : `$${fmtMoney(Number(form.cashPaid) || 0)}`} converts at the current saved rate into the {form.vaultCurrency} vault.
            </div>
          )}

          <div className="flex justify-between items-center p-3 rounded-lg border border-[#E2E8F0]">
            <span className="text-sm font-medium">Due Amount — <span className={due > 0 ? "text-[#D93025] font-semibold" : ""}>Factory owes beneficiary</span></span>
            <span className={`text-lg font-bold tabular-nums ${due > 0 ? "text-[#D93025]" : "text-[#1E8A44]"}`}>
              {form.currency === "IQD" ? `${fmtMoney(due, "IQD")} IQD` : `$${fmtMoney(due)}`}
            </span>
          </div>

          <label className="block">
            <span className="lbl">Notes</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp min-h-[64px]" />
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => router.push("/inventory")} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{editingNumber ? "Update Purchase" : "Record Purchase"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
