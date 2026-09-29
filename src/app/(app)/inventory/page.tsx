"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge, Skeleton, Pagination, Button, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { fmtMoney } from "@/lib/money";

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  aluminumType: string;
  totalPurchased: string;
  totalProcessed: string;
  available: string;
  status: string;
  threshold: string;
}

export default function InventoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [lossItem, setLossItem] = useState<ItemRow | null>(null);
  const [lossMode, setLossMode] = useState<"PERCENT" | "MANUAL">("PERCENT");
  const [lossPct, setLossPct] = useState("");
  const [manualKg, setManualKg] = useState("");
  const [lossNotes, setLossNotes] = useState("");
  const [lossDate, setLossDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${status}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, status]);

  useEffect(() => {
    load();
  }, [load]);

  function onSearch(v: string) {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setQ(v);
      setPage(1);
    }, 300);
  }

  const previewKg = (() => {
    if (!lossItem) return null;
    const original = Number(lossItem.available);
    if (lossMode === "PERCENT") {
      const pct = Number(lossPct);
      if (!pct || pct <= 0 || pct >= 100) return null;
      return { result: original * (1 - pct / 100), original, pct };
    }
    const rem = Number(manualKg);
    if (isNaN(rem) || rem < 0 || rem >= original) return null;
    return { result: rem, original, pct: ((original - rem) / original) * 100 };
  })();

  async function submitLoss(e: React.FormEvent) {
    e.preventDefault();
    if (!lossItem) return;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory/loss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: lossItem.id,
          mode: lossMode,
          lossPct: lossMode === "PERCENT" ? lossPct : undefined,
          remainingKg: lossMode === "MANUAL" ? manualKg : undefined,
          notes: lossNotes,
          processedAt: lossDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Loss failed", "error");
      else {
        toast("Loss applied.", "success");
        setLossItem(null);
        setLossPct("");
        setManualKg("");
        setLossNotes("");
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-sub">Stock on hand, losses applied, and availability</p>
        </div>
        <Button onClick={() => router.push("/pos/purchase")} icon="plus">New Purchase</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            placeholder="Search by name or SKU…"
            onChange={(e) => onSearch(e.target.value)}
            className="inp flex-1 min-w-[200px]"
            aria-label="Search inventory"
          />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="inp max-w-[160px]" aria-label="Filter status">
            <option value="">All statuses</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <div className="text-center py-14 px-6">
            <p className="text-sm text-[#6B7280] max-w-sm mx-auto">
              No inventory yet. Purchase raw material from a beneficiary to add stock.
            </p>
            <Button className="mt-4" onClick={() => router.push("/pos/purchase")}>New Purchase</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th className="num">Bought</th>
                  <th className="num">Lost</th>
                  <th className="num">Available</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td><span className="code">{item.sku}</span></td>
                    <td className="font-medium">
                      <Link href={`/inventory/${item.id}`} className="hover:text-[#1B5DB1]">{item.name}</Link>
                    </td>
                    <td className="text-[#6B7280]">{item.aluminumType}</td>
                    <td className="num">{fmtMoney(item.totalPurchased)}<span className="unit">kg</span></td>
                    <td className="num text-danger">{fmtMoney(item.totalProcessed)}<span className="unit">kg</span></td>
                    <td className="num font-semibold">{fmtMoney(item.available)}<span className="unit">kg</span></td>
                    <td>
                      {item.status === "in" ? <Badge kind="green">In Stock</Badge> : item.status === "low" ? <Badge kind="orange">Low Stock</Badge> : <Badge kind="red">Out of Stock</Badge>}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn-ghost btn-sm"
                          disabled={Number(item.available) <= 0}
                          onClick={() => setLossItem(item)}
                        >
                          Process Loss
                        </button>
                        <Link className="btn-ghost btn-sm" href={`/pos/purchase?restock=${encodeURIComponent(item.sku)}`}>
                          Restock
                        </Link>
                        <Link className="btn-ghost btn-sm" href={`/inventory/${item.id}`}>History</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
        )}
      </Card>

      {/* Loss modal */}
      <Modal open={!!lossItem} onClose={() => setLossItem(null)} title="Process Loss">
        {lossItem && (
          <form onSubmit={submitLoss} className="space-y-4">
            <div className="p-3 rounded-lg bg-[#F5F7FA] text-sm space-y-1">
              <p><strong>{lossItem.name}</strong> <span className="text-[#6B7280]">({lossItem.sku})</span></p>
              <p className="text-[#6B7280]">Current available: <strong className="text-[#1A1F36]">{fmtMoney(lossItem.available)} kg</strong></p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLossMode("PERCENT")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${lossMode === "PERCENT" ? "border-[#1B5DB1] bg-[#E8F0FB] text-[#1B5DB1]" : "border-[#E2E8F0] text-[#6B7280]"}`}
              >
                By percentage
              </button>
              <button
                type="button"
                onClick={() => setLossMode("MANUAL")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${lossMode === "MANUAL" ? "border-[#1B5DB1] bg-[#E8F0FB] text-[#1B5DB1]" : "border-[#E2E8F0] text-[#6B7280]"}`}
              >
                By exact remaining weight
              </button>
            </div>

            {lossMode === "PERCENT" ? (
              <Input
                label="Loss % *"
                type="number"
                step="0.01"
                min="0.01"
                max="99.99"
                required
                value={lossPct}
                onChange={(e) => setLossPct(e.target.value)}
              />
            ) : (
              <Input
                label="Remaining weight (kg) *"
                type="number"
                step="0.01"
                min="0"
                required
                value={manualKg}
                onChange={(e) => setManualKg(e.target.value)}
              />
            )}

            <div className="text-sm text-[#6B7280] italic min-h-[20px]">
              {previewKg &&
                `Result: ${fmtMoney(previewKg.result)} kg available after ${previewKg.pct.toFixed(2)}% loss from ${fmtMoney(previewKg.original)} kg`}
            </div>

            <Input label="Date" type="date" value={lossDate} onChange={(e) => setLossDate(e.target.value)} />
            <Input label="Notes" value={lossNotes} onChange={(e) => setLossNotes(e.target.value)} />

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setLossItem(null)} className="btn-secondary">Cancel</button>
              <Button type="submit" busy={busy}>Apply Loss</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
