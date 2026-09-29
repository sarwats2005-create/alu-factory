"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, Badge, Skeleton, Button } from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/money";

export default function InventoryItemPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/${id}`);
      const data = await res.json();
      setItem(data.item);
      setThreshold(data.item?.lowStockKg ?? "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveThreshold() {
    setBusy(true);
    try {
      await fetch(`/api/inventory/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lowStockKg: threshold === "" ? null : threshold }),
      });
      toastSafe();
      load();
    } finally {
      setBusy(false);
    }
  }

  function toastSafe() {
    import("@/components/Toast").then(({ toast }) => toast("Threshold saved.", "success"));
  }

  if (loading) return <Skeleton rows={8} />;
  if (!item) return <p className="text-sm text-[#6B7280]">Item not found.</p>;

  return (
    <div className="space-y-5">
      <Link href="/inventory" className="btn btn-ghost btn-sm w-fit">← Inventory</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{item.name}</h1>
          <p className="text-sm text-[#6B7280]">
            SKU <span className="font-mono">{item.sku}</span> · {item.aluminumType}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="lbl">Low-stock threshold (kg)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="inp max-w-[140px]"
              placeholder="Default"
            />
          </label>
          <Button variant="secondary" busy={busy} onClick={saveThreshold}>Save</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-[#6B7280] uppercase">Total Purchased</p>
          <p className="text-xl font-bold tabular-nums">{fmtMoney(item.totalPurchased)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#6B7280] uppercase">Loss Applied</p>
          <p className="text-xl font-bold tabular-nums text-[#D93025]">{fmtMoney(item.totalProcessed)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#6B7280] uppercase">Available</p>
          <p className="text-xl font-bold tabular-nums text-[#1E8A44]">{fmtMoney(item.available)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#6B7280] uppercase">Status</p>
          <p className="text-xl font-bold">
            {Number(item.available) <= 0 ? <Badge kind="red">Out</Badge> : Number(item.available) < Number(item.lowStockKg ?? item.threshold ?? 50) ? <Badge kind="orange">Low</Badge> : <Badge kind="green">In Stock</Badge>}
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Movement History</h2>
        {item.movements.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-4 text-center">No movements recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Direction</th>
                  <th className="text-right">Qty (kg)</th>
                  <th>Reference</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {item.movements.map((m: any) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.movedAt)}</td>
                    <td>
                      {m.direction === "IN" ? <Badge kind="green">IN</Badge> : m.direction === "OUT" ? <Badge kind="blue">OUT</Badge> : <Badge kind="orange">LOSS</Badge>}
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(m.qtyKg)}</td>
                    <td className="text-sm text-[#6B7280]">{m.reference || "—"}</td>
                    <td className="text-sm text-[#6B7280]">{m.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Loss Events</h2>
        {item.lossEvents.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-4 text-center">No loss events recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Original (kg)</th>
                  <th className="text-right">Loss (kg)</th>
                  <th className="text-right">Loss %</th>
                  <th className="text-right">Remaining (kg)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {item.lossEvents.map((e: any) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.processedAt)}</td>
                    <td className="text-right tabular-nums">{fmtMoney(e.originalKg)}</td>
                    <td className="text-right tabular-nums text-[#D93025]">{fmtMoney(e.lossKg)}</td>
                    <td className="text-right tabular-nums">{Number(e.lossPct).toFixed(2)}%</td>
                    <td className="text-right tabular-nums font-semibold">{fmtMoney(e.remainingKg)}</td>
                    <td className="text-sm text-[#6B7280]">{e.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
