"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Skeleton, Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { fmtDateTime, fmtMoney } from "@/lib/money";

const PAGES = ["dashboard", "customers", "beneficiaries", "inventory", "pos", "invoices", "vault", "reports", "settings"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [rateHistory, setRateHistory] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Forms
  const [rate, setRate] = useState("");
  const [newType, setNewType] = useState("");
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState<{ fullName: string; email: string; password: string; permissions: string[] }>({ fullName: "", email: "", password: "", permissions: [] });
  const [restoreTarget, setRestoreTarget] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes, tRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/settings/rate-history"),
        fetch("/api/settings/aluminum-types"),
      ]);
      const s = await sRes.json();
      const r = await rRes.json();
      const t = await tRes.json();
      setSettings(s.settings);
      setRate(s.settings?.exchangeRate ?? "");
      setRateHistory(r.rows || []);
      setTypes(t.types || []);

      if (s.settings) {
        const [uRes, bRes, aRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/backup"),
          fetch("/api/audit"),
        ]);
        if (uRes.ok) setUsers((await uRes.json()).users || []);
        if (bRes.ok) setBackups((await bRes.json()).backups || []);
        if (aRes.ok) setAuditRows((await aRes.json()).rows || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function put(body: object, msg: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Save failed", "error");
      else {
        toast(msg, "success");
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    if (!newType.trim()) return;
    const res = await fetch("/api/settings/aluminum-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newType }),
    });
    const d = await res.json();
    if (!res.ok) toast(d.error || "Failed", "error");
    else {
      toast("Type added.", "success");
      setNewType("");
      load();
    }
  }

  async function deleteType(id: string) {
    await fetch(`/api/settings/aluminum-types?id=${id}`, { method: "DELETE" });
    toast("Type removed.", "success");
    load();
  }

  async function saveUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(editingUser ? "/api/users" : "/api/users", {
        method: editingUser ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUser ? { id: editingUser.id, ...userForm } : userForm),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Save failed", "error");
      else {
        toast(editingUser ? "User updated." : "User created.", "success");
        setUserModal(false);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleUserActive(u: any) {
    const res = await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    const d = await res.json();
    if (!res.ok) toast(d.error || "Failed", "error");
    else load();
  }

  async function backupNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      if (res.ok) {
        toast("Backup created.", "success");
        load();
      } else toast("Backup failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function exportBackup() {
    const res = await fetch("/api/backup?action=export");
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `alu-backup-${Date.now()}.json`;
      a.click();
    }
  }

  async function doRestore() {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: restoreTarget.filename }),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Restore failed", "error");
      else toast("Restore complete.", "success");
      setRestoreTarget(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton rows={10} />;
  const isOwner = settings && users.length >= 0; // settings page itself is permission-gated

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Exchange rate, thresholds, users, backups, and audit trail</p>
        </div>
      </div>

      {/* Exchange rate */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Exchange Rate</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="lbl">1 USD = ? IQD</span>
            <input type="number" step="0.01" min="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="inp max-w-[180px]" />
          </label>
          <Button busy={busy} onClick={() => put({ exchangeRate: rate }, "Exchange rate saved.")}>Save Rate</Button>
        </div>
        {rateHistory.length > 0 && (
          <details className="mt-4">
            <summary className="text-sm text-[#1B5DB1] cursor-pointer">Rate history ({rateHistory.length})</summary>
            <table className="data mt-2">
              <thead>
                <tr><th>When</th><th>Old</th><th>New</th></tr>
              </thead>
              <tbody>
                {rateHistory.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDateTime(r.createdAt)}</td>
                    <td className="tabular-nums">{fmtMoney(r.oldRate)}</td>
                    <td className="tabular-nums font-semibold">{fmtMoney(r.newRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Card>

      {/* Aluminum types */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Aluminum Types</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {types.map((t) => (
            <span key={t.id} className="badge badge-blue">
              {t.name}
              <button onClick={() => deleteType(t.id)} className="ml-1 text-[#D93025] hover:text-red-700" aria-label={`Delete ${t.name}`}>×</button>
            </span>
          ))}
          {types.length === 0 && <p className="text-sm text-[#6B7280]">No types defined.</p>}
        </div>
        <form onSubmit={addType} className="flex gap-2">
          <input value={newType} onChange={(e) => setNewType(e.target.value)} className="inp max-w-[240px]" placeholder="New type (e.g. 6061-T6)" />
          <Button type="submit" variant="secondary">Add Type</Button>
        </form>
      </Card>

      {/* Thresholds & alerts */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Thresholds & Alerts</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <NumField label="Default low-stock threshold (kg)" value={settings?.defaultLowStockKg} onSave={(v) => put({ defaultLowStockKg: v }, "Threshold saved.")} />
          <NumField label="Overdue payment days" value={settings?.overdueDays} onSave={(v) => put({ overdueDays: v }, "Threshold saved.")} />
          <NumField label="Customer due alert threshold ($)" value={settings?.customerDueThreshold} onSave={(v) => put({ customerDueThreshold: v }, "Threshold saved.")} />
          <NumField label="Beneficiary due alert threshold ($)" value={settings?.beneficiaryDueThreshold} onSave={(v) => put({ beneficiaryDueThreshold: v }, "Threshold saved.")} />
          <NumField label="Vault low balance alert ($)" value={settings?.vaultLowThresholdUsd} onSave={(v) => put({ vaultLowThresholdUsd: v }, "Threshold saved.")} />
        </div>
        <div className="mt-4 space-y-2">
          <Toggle label="Customer due balance alerts" checked={settings?.alertCustomerDue} onChange={(v) => put({ alertCustomerDue: v }, "Updated.")} />
          <Toggle label="Beneficiary due balance alerts" checked={settings?.alertBeneficiaryDue} onChange={(v) => put({ alertBeneficiaryDue: v }, "Updated.")} />
          <Toggle label="Low stock alerts" checked={settings?.alertLowStock} onChange={(v) => put({ alertLowStock: v }, "Updated.")} />
          <Toggle label="Vault low balance alerts" checked={settings?.alertVaultLow} onChange={(v) => put({ alertVaultLow: v }, "Updated.")} />
          <Toggle label="Overdue payment alerts" checked={settings?.alertOverdue} onChange={(v) => put({ alertOverdue: v }, "Updated.")} />
        </div>
      </Card>

      {/* Language */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Language</h2>
        <p className="text-sm text-[#6B7280] mb-3">Switch between English and Kurdish Sorani (کوردی). Layout switches to RTL automatically. Use the language button in the top bar.</p>
        <Button variant="secondary" onClick={() => {
          const cur = localStorage.getItem("alu_lang") || "en";
          const next = cur === "en" ? "ku" : "en";
          localStorage.setItem("alu_lang", next);
          document.documentElement.dir = next === "ku" ? "rtl" : "ltr";
          toast("Language switched — reload to fully apply.", "success");
        }}>Toggle Language</Button>
      </Card>

      {/* Email reports (Owner) */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Scheduled Email Reports (Owner)</h2>
        <label className="block mb-3">
          <span className="lbl">Email for reports</span>
          <input
            type="email"
            value={settings?.emailReportsTo ?? ""}
            onChange={(e) => setSettings({ ...settings, emailReportsTo: e.target.value })}
            onBlur={(e) => put({ emailReportsTo: e.target.value }, "Email saved.")}
            className="inp max-w-[320px]"
            placeholder="owner@example.com"
          />
        </label>
        <Toggle label="Daily summary email" checked={settings?.emailDaily} onChange={(v) => put({ emailDaily: v }, "Updated.")} />
        <Toggle label="Weekly full report email" checked={settings?.emailWeekly} onChange={(v) => put({ emailWeekly: v }, "Updated.")} />
      </Card>

      {/* User management (Owner) */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">User Management (Owner)</h2>
          <Button onClick={() => { setEditingUser(null); setUserForm({ fullName: "", email: "", password: "", permissions: [] }); setUserModal(true); }}>+ Create User</Button>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-[#6B7280]">Loading users…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Pages</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.fullName}</td>
                    <td>{u.email}</td>
                    <td><Badge kind={u.role === "OWNER" ? "blue" : "gray"}>{u.role}</Badge></td>
                    <td><Badge kind={u.active ? "green" : "red"}>{u.active ? "Active" : "Inactive"}</Badge></td>
                    <td className="text-sm text-[#6B7280]">
                      {u.role === "OWNER" ? "All pages" : Object.entries(u.permissions || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "None"}
                    </td>
                    <td>
                      {u.role !== "OWNER" && (
                        <div className="flex gap-1">
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => {
                              setEditingUser(u);
                              setUserForm({
                                fullName: u.fullName,
                                email: u.email,
                                password: "",
                                permissions: Object.entries(u.permissions || {}).filter(([, v]) => v).map(([k]) => k),
                              });
                              setUserModal(true);
                            }}
                          >
                            Edit
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => toggleUserActive(u)}>
                            {u.active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Backup & restore (Owner) */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Backup & Restore (Owner)</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button busy={busy} onClick={backupNow}>Backup Now</Button>
          <Button variant="secondary" onClick={exportBackup}>Export Full Backup (JSON)</Button>
        </div>
        {backups.length > 0 && (
          <table className="data">
            <thead><tr><th>File</th><th>Kind</th><th>Size</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <td className="font-mono text-xs">{b.filename}</td>
                  <td><Badge kind={b.kind === "AUTO" ? "gray" : "blue"}>{b.kind}</Badge></td>
                  <td className="tabular-nums">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td>{fmtDateTime(b.createdAt)}</td>
                  <td>
                    <button className="btn-ghost btn-sm text-[#D93025]" onClick={() => setRestoreTarget(b)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Audit log (Owner) */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">Audit Log (Owner)</h2>
        {auditRows.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="data">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Module</th><th>Record</th></tr></thead>
              <tbody>
                {auditRows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                    <td>{r.user.fullName}</td>
                    <td><Badge kind="gray">{r.action}</Badge></td>
                    <td>{r.module}</td>
                    <td className="text-xs text-[#6B7280] font-mono">{r.recordRef?.slice(0, 12) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* User modal */}
      <Modal open={userModal} onClose={() => setUserModal(false)} title={editingUser ? "Edit User" : "Create User"}>
        <form onSubmit={saveUser} className="space-y-4">
          <label className="block">
            <span className="lbl">Full Name *</span>
            <input required value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Email *</span>
            <input type="email" required value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="inp" disabled={!!editingUser} />
          </label>
          <label className="block">
            <span className="lbl">{editingUser ? "New Password (leave blank to keep)" : "Password *"}</span>
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              className="inp"
              minLength={editingUser ? 0 : 8}
              required={!editingUser}
            />
          </label>
          <div>
            <span className="lbl">Per-page access</span>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {PAGES.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={userForm.permissions.includes(p)}
                    onChange={(e) => {
                      if (e.target.checked) setUserForm({ ...userForm, permissions: [...userForm.permissions, p] });
                      else setUserForm({ ...userForm, permissions: userForm.permissions.filter((x) => x !== p) });
                    }}
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setUserModal(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{editingUser ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>

      {/* Restore confirm */}
      <Modal open={!!restoreTarget} onClose={() => setRestoreTarget(null)} title="Restore Backup">
        <p className="text-sm">
          Restoring <strong className="font-mono text-xs">{restoreTarget?.filename}</strong> will <strong className="text-[#D93025]">REPLACE ALL DATA</strong> with the backup contents. This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setRestoreTarget(null)} className="btn-secondary">Cancel</button>
          <Button variant="danger" busy={busy} onClick={doRestore}>Restore Now</Button>
        </div>
      </Modal>
    </div>
  );
}

function NumField({ label, value, onSave }: { label: string; value: any; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <div className="flex gap-2">
        <input type="number" step="0.01" min="0" value={v} onChange={(e) => setV(e.target.value)} className="inp" />
        <Button variant="secondary" onClick={() => onSave(Number(v))}>Save</Button>
      </div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative ${checked ? "bg-[#1B5DB1]" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
