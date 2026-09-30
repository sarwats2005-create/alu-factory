"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Badge, Skeleton, Button, StatCard, BackLink } from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/money";

export default function InventoryItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
  if (!item) return <p className="text-sm text-muted">Item not found.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <BackLink href="/inventory">Inventory</BackLink>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{item.name}</h1>
            {Number(item.available) <= 0 ? <Badge kind="red">Out of Stock</Badge> : Number(item.available) < Number(item.lowStockKg ?? item.threshold ?? 50) ? <Badge kind="orange">Low Stock</Badge> : <Badge kind="green">In Stock</Badge>}
          </div>
          <p className="entity-meta">
            <span className="code">{item.sku}</span>
            <span>{item.aluminumType}</span>
          </p>
        </div>
        <Button icon="plus" className="no-print" onClick={() => router.push(`/pos/purchase?restock=${encodeURIComponent(item.sku)}`)}>
          Restock
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Available" value={`${fmtMoney(item.available)} kg`} tone="good" icon="box" />
        <StatCard label="Total Purchased" value={`${fmtMoney(item.totalPurchased)} kg`} />
        <StatCard
          label="Loss Applied"
          value={`${fmtMoney(item.totalProcessed)} kg`}
          tone={Number(item.totalProcessed) > 0 ? "bad" : "neutral"}
          sub={Number(item.totalPurchased) > 0 ? `${((Number(item.totalProcessed) / Number(item.totalPurchased)) * 100).toFixed(1)}% of purchased` : undefined}
        />
        <div className="card stat">
          <p className="stat-label">Low-stock alert at</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="inp"
              placeholder="Default (50)"
              aria-label="Low-stock threshold (kg)"
            />
            <Button variant="secondary" busy={busy} onClick={saveThreshold}>Save</Button>
          </div>
          <p className="stat-sub">kg — alert when available drops below</p>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Movement History</h2>
        {item.movements.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No movements recorded.</p>
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
                    <td className={`text-right tabular-nums font-medium ${m.direction === "IN" ? "text-success" : m.direction === "LOSS" ? "text-danger" : ""}`}>
                      {m.direction === "IN" ? "+" : "−"}{fmtMoney(m.qtyKg)}
                    </td>
                    <td className="text-sm"><span className="code">{m.reference || "—"}</span></td>
                    <td className="text-sm text-muted">{m.note || "—"}</td>
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
          <p className="text-sm text-muted py-4 text-center">No loss events recorded.</p>
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
                    <td className="text-sm text-muted">{e.notes || "—"}</td>
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
