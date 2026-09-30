"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge, Skeleton, Pagination, Button, Input, Select, Textarea, SearchInput, EmptyState, IconButton } from "@/components/ui";
import { Icon } from "@/components/icons";
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
        <div className="toolbar">
          <SearchInput className="grow" placeholder="Search by name or SKU…" onSearch={onSearch} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="inp" aria-label="Filter status">
            <option value="">All statuses</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="box"
            title="No inventory yet"
            message="Purchase raw material from a beneficiary to add stock."
            cta="New Purchase"
            onCta={() => router.push("/pos/purchase")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
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
                    <td>
                      <Link href={`/inventory/${item.id}`} className="block hover:text-[#1B5DB1]">
                        <span className="block font-medium">{item.name}</span>
                        <span className="code text-muted text-xs">{item.sku}</span>
                      </Link>
                    </td>
                    <td className="text-muted">{item.aluminumType}</td>
                    <td className="num">{fmtMoney(item.totalPurchased)}<span className="unit">kg</span></td>
                    <td className="num text-danger">{fmtMoney(item.totalProcessed)}<span className="unit">kg</span></td>
                    <td className="num font-semibold">
                      {fmtMoney(item.available)}<span className="unit">kg</span>
                      <StockMeter available={Number(item.available)} bought={Number(item.totalPurchased)} status={item.status} />
                    </td>
                    <td>
                      {item.status === "in" ? <Badge kind="green">In Stock</Badge> : item.status === "low" ? <Badge kind="orange">Low Stock</Badge> : <Badge kind="red">Out of Stock</Badge>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <IconButton
                          icon="scale"
                          tone="edit"
                          label={`Record processing loss for ${item.name}`}
                          disabled={Number(item.available) <= 0}
                          onClick={() => setLossItem(item)}
                        />
                        <Link
                          className="icon-btn icon-btn--view"
                          href={`/pos/purchase?restock=${encodeURIComponent(item.sku)}`}
                          aria-label={`Restock ${item.name}`}
                          title="Restock"
                        >
                          <Icon name="box" size={16} />
                        </Link>
                        <Link
                          className="icon-btn icon-btn--neutral"
                          href={`/inventory/${item.id}`}
                          aria-label={`Movement history for ${item.name}`}
                          title="History"
                        >
                          <Icon name="timer" size={16} />
                        </Link>
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
              <p><strong>{lossItem.name}</strong> <span className="text-muted">({lossItem.sku})</span></p>
              <p className="text-muted">Current available: <strong className="text-[#1A1F36]">{fmtMoney(lossItem.available)} kg</strong></p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLossMode("PERCENT")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${lossMode === "PERCENT" ? "border-[#1B5DB1] bg-[#E8F0FB] text-[#1B5DB1]" : "border-[#E2E8F0] text-muted"}`}
              >
                By percentage
              </button>
              <button
                type="button"
                onClick={() => setLossMode("MANUAL")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${lossMode === "MANUAL" ? "border-[#1B5DB1] bg-[#E8F0FB] text-[#1B5DB1]" : "border-[#E2E8F0] text-muted"}`}
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

            {previewKg && (
              <div className="p-3 rounded-lg bg-[#E8F0FB] text-sm" role="status">
                <div className="sum-row !py-0.5"><span>Before</span><strong>{fmtMoney(previewKg.original)} kg</strong></div>
                <div className="sum-row !py-0.5"><span>Loss</span><strong className="!text-[var(--danger)]">−{previewKg.pct.toFixed(2)}%</strong></div>
                <div className="sum-row total !mt-1 !pt-2"><span>Available after</span><strong className="!text-[17px]">{fmtMoney(previewKg.result)} kg</strong></div>
              </div>
            )}

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

/** Tiny remaining-stock bar: lets the eye spot low items without reading numbers. */
function StockMeter({ available, bought, status }: { available: number; bought: number; status: string }) {
  const pct = bought > 0 ? Math.max(0, Math.min(100, (available / bought) * 100)) : 0;
  const color = status === "out" ? "var(--danger)" : status === "low" ? "var(--warn)" : "var(--success)";
  return (
    <span className="block h-1 mt-1.5 rounded-full bg-[var(--border)] overflow-hidden ms-auto max-w-[96px]" aria-hidden="true">
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}
