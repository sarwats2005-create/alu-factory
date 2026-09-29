"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, Badge, Skeleton, Pagination, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";

interface BenRow {
  id: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  due: string;
  state: string;
}

export default function BeneficiariesPage() {
  const [rows, setRows] = useState<BenRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BenRow | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "+964 ", address: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<BenRow | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/beneficiaries?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q]);

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/beneficiaries/${editing.id}` : "/api/beneficiaries", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Save failed", "error");
        return;
      }
      toast(editing ? "Beneficiary updated." : "Beneficiary added.", "success");
      setModalOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/beneficiaries/${deleting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Delete failed", "error");
      else {
        toast("Beneficiary deleted.", "success");
        load();
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
          <h1 className="page-title">Beneficiaries</h1>
          <p className="page-sub">Raw-material suppliers and what the factory owes them</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ fullName: "", phone: "+964 ", address: "" }); setModalOpen(true); }} icon="plus">
          Add Beneficiary
        </Button>
      </div>

      <Card className="p-4">
        <input
          placeholder="Search by name…"
          onChange={(e) => onSearch(e.target.value)}
          className="inp mb-4"
          aria-label="Search beneficiaries"
        />

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="handshake"
            title="No beneficiaries yet"
            message="Add a beneficiary to record your first raw material purchase."
            cta="Add Beneficiary"
            onCta={() => { setEditing(null); setForm({ fullName: "", phone: "+964 ", address: "" }); setModalOpen(true); }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Beneficiary</th>
                  <th>Phone</th>
                  <th>Balance State</th>
                  <th className="text-right">Due Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/beneficiaries/${b.id}`} className="font-medium hover:text-[#1B5DB1]">
                        {b.fullName}
                      </Link>
                    </td>
                    <td className="text-[#6B7280]">{b.phone || "—"}</td>
                    <td>
                      {b.state === "factory_owes" ? (
                        <Badge kind="red">Factory owes beneficiary</Badge>
                      ) : b.state === "overpaid" ? (
                        <Badge kind="orange">Beneficiary owes factory</Badge>
                      ) : (
                        <Badge kind="green">Settled</Badge>
                      )}
                    </td>
                    <td className={`text-right font-semibold tabular-nums ${Number(b.due) > 0 ? "text-[#D93025]" : "text-[#6B7280]"}`}>
                      ${fmtMoneySafe(b.due)}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link href={`/beneficiaries/${b.id}`} className="btn-ghost btn-sm">View</Link>
                        <button onClick={() => { setEditing(b); setForm({ fullName: b.fullName, phone: b.phone || "", address: b.address || "" }); setModalOpen(true); }} className="btn-ghost btn-sm">Edit</button>
                        <button onClick={() => setDeleting(b)} className="btn-ghost btn-sm text-[#D93025]">Delete</button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Beneficiary" : "Add Beneficiary"}>
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="lbl">Full Name *</span>
            <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="inp" placeholder="+964 ..." />
          </label>
          <label className="block">
            <span className="lbl">Address</span>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="inp" />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{editing ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Beneficiary">
        <p className="text-sm">
          Delete <strong>{deleting?.fullName}</strong>? This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setDeleting(null)} className="btn-secondary">Cancel</button>
          <Button variant="danger" busy={busy} onClick={doDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function fmtMoneySafe(v: string) {
  const n = Number(v);
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
