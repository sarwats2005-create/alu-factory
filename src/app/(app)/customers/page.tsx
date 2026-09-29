"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, Badge, Skeleton, Pagination, Button, Input } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { fmtMoney } from "@/lib/money";

interface CustomerRow {
  id: string;
  fullName: string;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  due: string;
  state: string;
}

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "+964 ", address: "", photo: "" });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&filter=${filter}`);
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch {
      toast("Connection lost. Check your internet and try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, filter]);

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

  function openAdd() {
    setEditing(null);
    setForm({ fullName: "", phone: "+964 ", address: "", photo: "" });
    setModalOpen(true);
  }

  function openEdit(c: CustomerRow) {
    setEditing(c);
    setForm({ fullName: c.fullName, phone: c.phone || "", address: c.address || "", photo: c.photo || "" });
    setModalOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/customers/${editing.id}` : "/api/customers", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Save failed", "error");
        return;
      }
      toast(editing ? "Customer updated." : "Customer added.", "success");
      setModalOpen(false);
      load();
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
      const res = await fetch(`/api/customers/${deleting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Delete failed", "error");
      else {
        toast("Customer deleted.", "success");
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
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Track dues, balances, and history per customer</p>
        </div>
        <Button onClick={openAdd} icon="plus">Add Customer</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            placeholder="Search by name…"
            onChange={(e) => onSearch(e.target.value)}
            className="inp flex-1 min-w-[200px]"
            aria-label="Search customers"
          />
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="inp max-w-[180px]" aria-label="Filter by balance">
            <option value="all">All balances</option>
            <option value="due">Customer owes factory</option>
            <option value="settled">Settled</option>
          </select>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="users"
            title="No customers yet"
            message="Add your first customer to start recording sales and tracking dues."
            cta="Add Customer"
            onCta={openAdd}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Balance State</th>
                  <th className="text-right">Due Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/customers/${c.id}`} className="flex items-center gap-2.5 hover:text-[#1B5DB1]">
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <span className="w-9 h-9 rounded-full bg-[#E8F0FB] text-[#1B5DB1] flex items-center justify-center text-sm font-semibold">
                            {c.fullName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium">{c.fullName}</span>
                      </Link>
                    </td>
                    <td className="text-[#6B7280]">{c.phone || "—"}</td>
                    <td>
                      {c.state === "due" ? (
                        <Badge kind="red">Customer owes factory</Badge>
                      ) : (
                        <Badge kind="green">Settled</Badge>
                      )}
                    </td>
                    <td className={`text-right font-semibold tabular-nums ${Number(c.due) > 0 ? "text-[#D93025]" : "text-[#6B7280]"}`}>
                      ${fmtMoney(c.due)}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link href={`/customers/${c.id}`} className="btn-ghost btn-sm">View</Link>
                        <button onClick={() => openEdit(c)} className="btn-ghost btn-sm">Edit</button>
                        <button onClick={() => setDeleting(c)} className="btn-ghost btn-sm text-[#D93025]">Delete</button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Customer" : "Add Customer"}>
        <form onSubmit={save} className="space-y-4">
          <Input
            label="Full Name *"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+964 ..."
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <label className="block">
            <span className="lbl">Profile Picture</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 1024 * 1024) {
                  toast("Image must be under 1 MB.", "error");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setForm((p) => ({ ...p, photo: String(reader.result) }));
                reader.readAsDataURL(f);
              }}
              className="inp"
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{editing ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Customer">
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
