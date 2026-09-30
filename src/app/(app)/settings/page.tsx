"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Skeleton, Button } from "@/components/ui";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { Icon } from "@/components/icons";
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
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<any[] | null>(null);

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
        if (uRes.ok) {
          const list = (await uRes.json()).users || [];
          setUsers(list);
          setSelectedUsers((sel) => sel.filter((id) => list.some((u: any) => u.id === id)));
        }
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

  async function deleteUsers() {
    if (!deleteTargets?.length) return;
    setBusy(true);
    try {
      const ids = deleteTargets.map((u) => u.id);
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const d = await res.json();
      if (!res.ok) toast(d.error || "Delete failed", "error");
      else {
        toast(ids.length === 1 ? "User deleted." : `${ids.length} users deleted.`, "success");
        setSelectedUsers((sel) => sel.filter((id) => !ids.includes(id)));
        load();
      }
      setDeleteTargets(null);
    } finally {
      setBusy(false);
    }
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

  const activeSection = useScrollSpy(SECTIONS.map((s) => s.id), !loading);

  if (loading) return <Skeleton rows={10} />;
  const deletableUsers = users.filter((u) => u.role !== "OWNER");
  const allSelected = deletableUsers.length > 0 && deletableUsers.every((u) => selectedUsers.includes(u.id));
  const selectedRows = users.filter((u) => selectedUsers.includes(u.id));

  return (
    <div className="space-y-5">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Exchange rate, alerts, users, backups, and audit trail</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* In-page map: the page is long, so show its shape and where you are. */}
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={activeSection === s.id ? "active" : ""}>
              <Icon name={s.icon} size={15} />
              {s.label}
            </a>
          ))}
        </nav>

        <div className="space-y-5 min-w-0 max-w-4xl">
          {/* ===== General ===== */}
          <Card className="p-5">
            <div id="general" className="settings-section" />
            <h2 className="section-title">Exchange Rate</h2>
            <p className="section-desc mb-4">Used to convert between the USD and IQD vaults. Every change is logged.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="lbl">1 USD = ? IQD</span>
                <input type="number" step="0.01" min="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="inp max-w-[180px]" />
              </label>
              <Button busy={busy} onClick={() => put({ exchangeRate: rate }, "Exchange rate saved.")} disabled={String(rate) === String(settings?.exchangeRate ?? "")}>
                Save Rate
              </Button>
            </div>
            {rateHistory.length > 0 && (
              <details className="mt-4">
                <summary className="text-sm font-medium text-[var(--brand)] cursor-pointer w-fit">Rate history ({rateHistory.length})</summary>
                <div className="overflow-x-auto mt-2">
                  <table className="data">
                    <thead>
                      <tr><th>When</th><th className="text-right">Old</th><th className="text-right">New</th></tr>
                    </thead>
                    <tbody>
                      {rateHistory.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDateTime(r.createdAt)}</td>
                          <td className="text-right tabular-nums text-muted">{fmtMoney(r.oldRate)}</td>
                          <td className="text-right tabular-nums font-semibold">{fmtMoney(r.newRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="section-title">Aluminum Types</h2>
            <p className="section-desc mb-4">Suggested in the purchase form. Removing a type does not change past records.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {types.map((t) => (
                <span key={t.id} className="badge badge-blue !pe-1.5">
                  {t.name}
                  <button
                    onClick={() => deleteType(t.id)}
                    className="w-5 h-5 rounded-full inline-flex items-center justify-center hover:bg-[var(--danger-50)] hover:text-[var(--danger)]"
                    aria-label={`Remove ${t.name}`}
                    title={`Remove ${t.name}`}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              {types.length === 0 && <p className="text-sm text-muted">No types defined.</p>}
            </div>
            <form onSubmit={addType} className="flex gap-2">
              <input value={newType} onChange={(e) => setNewType(e.target.value)} className="inp max-w-[240px]" placeholder="New type (e.g. 6061-T6)" />
              <Button type="submit" variant="secondary" icon="plus" disabled={!newType.trim()}>Add Type</Button>
            </form>
          </Card>

          {/* ===== Alerts: each switch sits beside the threshold it uses. ===== */}
          <Card className="p-5">
            <div id="alerts" className="settings-section" />
            <h2 className="section-title">Alerts &amp; Thresholds</h2>
            <p className="section-desc mb-2">Alerts appear under the bell. Set when each one fires.</p>
            <AlertRow
              label="Customer due balance"
              desc="Alert when a customer owes more than"
              checked={settings?.alertCustomerDue}
              onToggle={(v) => put({ alertCustomerDue: v }, "Updated.")}
              value={settings?.customerDueThreshold}
              prefix="$"
              onSave={(v) => put({ customerDueThreshold: v }, "Threshold saved.")}
            />
            <AlertRow
              label="Beneficiary due balance"
              desc="Alert when the factory owes a beneficiary more than"
              checked={settings?.alertBeneficiaryDue}
              onToggle={(v) => put({ alertBeneficiaryDue: v }, "Updated.")}
              value={settings?.beneficiaryDueThreshold}
              prefix="$"
              onSave={(v) => put({ beneficiaryDueThreshold: v }, "Threshold saved.")}
            />
            <AlertRow
              label="Low stock"
              desc="Default level for items without their own threshold"
              checked={settings?.alertLowStock}
              onToggle={(v) => put({ alertLowStock: v }, "Updated.")}
              value={settings?.defaultLowStockKg}
              suffix="kg"
              onSave={(v) => put({ defaultLowStockKg: v }, "Threshold saved.")}
            />
            <AlertRow
              label="Vault low balance"
              desc="Alert when combined cash falls below"
              checked={settings?.alertVaultLow}
              onToggle={(v) => put({ alertVaultLow: v }, "Updated.")}
              value={settings?.vaultLowThresholdUsd}
              prefix="$"
              onSave={(v) => put({ vaultLowThresholdUsd: v }, "Threshold saved.")}
            />
            <AlertRow
              label="Overdue payments"
              desc="Alert when an unpaid balance is older than"
              checked={settings?.alertOverdue}
              onToggle={(v) => put({ alertOverdue: v }, "Updated.")}
              value={settings?.overdueDays}
              suffix="days"
              step="1"
              onSave={(v) => put({ overdueDays: v }, "Threshold saved.")}
            />
          </Card>

          {/* ===== Email reports ===== */}
          <Card className="p-5">
            <div id="email" className="settings-section" />
            <h2 className="section-title">Scheduled Email Reports</h2>
            <p className="section-desc mb-4">Summaries sent automatically to the owner.</p>
            <label className="block mb-2">
              <span className="lbl">Send reports to</span>
              <input
                type="email"
                value={settings?.emailReportsTo ?? ""}
                onChange={(e) => setSettings({ ...settings, emailReportsTo: e.target.value })}
                onBlur={(e) => put({ emailReportsTo: e.target.value }, "Email saved.")}
                className="inp max-w-[320px]"
                placeholder="owner@example.com"
              />
              <span className="field-hint">Saved automatically when you leave the field.</span>
            </label>
            <div className="set-row">
              <div><p className="text-[13.5px] font-medium">Daily summary</p><p className="section-desc">Sales, cash and dues for the day</p></div>
              <Toggle label="Daily summary email" checked={settings?.emailDaily} onChange={(v) => put({ emailDaily: v }, "Updated.")} />
            </div>
            <div className="set-row">
              <div><p className="text-[13.5px] font-medium">Weekly full report</p><p className="section-desc">Every report type for the past week</p></div>
              <Toggle label="Weekly full report email" checked={settings?.emailWeekly} onChange={(v) => put({ emailWeekly: v }, "Updated.")} />
            </div>
          </Card>

          {/* ===== Users ===== */}
          <Card className="p-5">
            <div id="users" className="settings-section" />
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title">Users &amp; Access</h2>
                <p className="section-desc">Who can sign in, and which pages each person can open.</p>
              </div>
              <Button icon="plus" onClick={() => { setEditingUser(null); setUserForm({ fullName: "", email: "", password: "", permissions: [] }); setUserModal(true); }}>Create User</Button>
            </div>

            {selectedUsers.length > 0 && (
              <div className="bulk-bar" role="status">
                <span>{selectedUsers.length} selected</span>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUsers([])}>Clear</button>
                  <Button variant="danger" className="btn-sm" icon="trash" onClick={() => setDeleteTargets(selectedRows)}>
                    Delete {selectedUsers.length === 1 ? "user" : `${selectedUsers.length} users`}
                  </Button>
                </div>
              </div>
            )}

            {users.length === 0 ? (
              <p className="text-sm text-muted">Loading users…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all users"
                          checked={allSelected}
                          disabled={deletableUsers.length === 0}
                          onChange={(e) => setSelectedUsers(e.target.checked ? deletableUsers.map((u) => u.id) : [])}
                        />
                      </th>
                      <th>Name</th><th>Role</th><th>Status</th><th>Pages</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          {u.role !== "OWNER" && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${u.fullName}`}
                              checked={selectedUsers.includes(u.id)}
                              onChange={(e) =>
                                setSelectedUsers((sel) => (e.target.checked ? [...sel, u.id] : sel.filter((id) => id !== u.id)))
                              }
                            />
                          )}
                        </td>
                        <td>
                          <span className="block font-medium">{u.fullName}</span>
                          <span className="block text-[12px] text-muted" dir="ltr">{u.email}</span>
                        </td>
                        <td><Badge kind={u.role === "OWNER" ? "blue" : "gray"}>{u.role === "OWNER" ? "Owner" : "User"}</Badge></td>
                        <td><Badge kind={u.active ? "green" : "red"} dot>{u.active ? "Active" : "Inactive"}</Badge></td>
                        <td className="text-[12.5px] text-muted max-w-[260px]">
                          {u.role === "OWNER" ? "All pages" : (() => {
                            const pages = Object.entries(u.permissions || {}).filter(([, v]) => v).map(([k]) => k);
                            return pages.length ? <span className="capitalize">{pages.join(", ")}</span> : "None";
                          })()}
                        </td>
                        <td>
                          {u.role !== "OWNER" && (
                            <div className="row-actions">
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
                              <button className="btn-ghost btn-sm is-danger" onClick={() => setDeleteTargets([u])}>
                                Delete
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

          {/* ===== Backup ===== */}
          <Card className="p-5">
            <div id="backup" className="settings-section" />
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="section-title">Backup &amp; Restore</h2>
                <p className="section-desc">
                  {settings?.autoBackup ? "Automatic backups are on." : "Automatic backups are off."} Restoring replaces all current data.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon="download" onClick={exportBackup}>Export JSON</Button>
                <Button busy={busy} icon="shield" onClick={backupNow}>Backup Now</Button>
              </div>
            </div>
            {backups.length > 0 && (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead><tr><th>Created</th><th>File</th><th>Kind</th><th className="text-right">Size</th><th></th></tr></thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(b.createdAt)}</td>
                        <td className="font-mono text-xs text-muted">{b.filename}</td>
                        <td><Badge kind={b.kind === "AUTO" ? "gray" : "blue"}>{b.kind === "AUTO" ? "Auto" : "Manual"}</Badge></td>
                        <td className="text-right tabular-nums">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                        <td className="text-right">
                          <button className="btn-ghost btn-sm is-danger" onClick={() => setRestoreTarget(b)}>Restore…</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ===== Audit ===== */}
          <Card className="p-5">
            <div id="audit" className="settings-section" />
            <h2 className="section-title">Audit Log</h2>
            <p className="section-desc mb-4">Who did what, and when. Most recent first.</p>
            {auditRows.length === 0 ? (
              <p className="text-sm text-muted">No audit entries yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="data">
                  <thead><tr><th>When</th><th>User</th><th>Action</th><th>Module</th><th>Record</th></tr></thead>
                  <tbody>
                    {auditRows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                        <td>{r.user.fullName}</td>
                        <td><Badge kind={r.action === "DELETE" ? "red" : r.action === "CREATE" ? "green" : r.action === "LOGIN" || r.action === "LOGOUT" ? "gray" : "blue"}>{r.action}</Badge></td>
                        <td>{r.module}</td>
                        <td className="text-xs text-muted font-mono">{r.recordRef?.slice(0, 12) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

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
            {!editingUser && <span className="field-hint">At least 8 characters.</span>}
          </label>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="lbl !mb-0">Page access</span>
              <button
                type="button"
                className="text-[12px] font-semibold text-[var(--brand)] hover:underline"
                onClick={() => setUserForm({ ...userForm, permissions: userForm.permissions.length === PAGES.length ? [] : [...PAGES] })}
              >
                {userForm.permissions.length === PAGES.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAGES.map((p) => {
                const on = userForm.permissions.includes(p);
                return (
                  <label key={p} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border cursor-pointer transition-colors ${on ? "border-[var(--brand)] bg-[var(--brand-50)]" : "border-[var(--border)]"}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        if (e.target.checked) setUserForm({ ...userForm, permissions: [...userForm.permissions, p] });
                        else setUserForm({ ...userForm, permissions: userForm.permissions.filter((x) => x !== p) });
                      }}
                    />
                    <span className="capitalize">{p}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setUserModal(false)} className="btn-secondary">Cancel</button>
            <Button type="submit" busy={busy}>{editingUser ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete user(s) confirm */}
      <ConfirmDialog
        open={!!deleteTargets}
        onClose={() => setDeleteTargets(null)}
        onConfirm={deleteUsers}
        danger
        busy={busy}
        title={deleteTargets && deleteTargets.length > 1 ? "Delete Users" : "Delete User"}
        confirmLabel={deleteTargets && deleteTargets.length > 1 ? `Delete ${deleteTargets.length} Users` : "Delete User"}
        message={
          deleteTargets
            ? [
                deleteTargets.length > 1
                  ? `You are about to permanently delete ${deleteTargets.length} users:`
                  : "You are about to permanently delete this user:",
                ...deleteTargets.map((u) => `• ${u.fullName} (${u.email})`),
                "",
                "Their account, permissions, audit history and exchange-rate log entries will be removed from the database. This action cannot be undone.",
              ].join("\n")
            : ""
        }
      />

      {/* Restore confirm */}
      <Modal open={!!restoreTarget} onClose={() => setRestoreTarget(null)} title="Restore Backup">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-[var(--danger-50)] text-[var(--danger)] flex items-center justify-center shrink-0">
            <Icon name="alert" size={17} />
          </span>
          <p className="text-sm leading-relaxed pt-1">
            Restoring <strong className="font-mono text-xs">{restoreTarget?.filename}</strong> will <strong className="text-danger">replace all current data</strong> with the backup contents. This action cannot be undone.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setRestoreTarget(null)} className="btn-secondary">Cancel</button>
          <Button variant="danger" busy={busy} onClick={doRestore}>Restore Now</Button>
        </div>
      </Modal>
    </div>
  );
}

const SECTIONS = [
  { id: "general", label: "General", icon: "dollar" },
  { id: "alerts", label: "Alerts", icon: "bell" },
  { id: "email", label: "Email reports", icon: "file" },
  { id: "users", label: "Users & access", icon: "users" },
  { id: "backup", label: "Backup", icon: "shield" },
  { id: "audit", label: "Audit log", icon: "eye" },
] as const;

/** Highlights the section currently in view (anchors are zero-height markers at each card's top). */
function useScrollSpy(ids: string[], ready: boolean) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (!ready) return;
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 140) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = ids[ids.length - 1];
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return active;
}

/** One alert: what it watches, its threshold, and its on/off switch — together. */
function AlertRow({
  label,
  desc,
  checked,
  onToggle,
  value,
  prefix,
  suffix,
  step = "0.01",
  onSave,
}: {
  label: string;
  desc: string;
  checked?: boolean;
  onToggle: (v: boolean) => void;
  value: any;
  prefix?: string;
  suffix?: string;
  step?: string;
  onSave: (v: number) => void;
}) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  const dirty = String(v) !== String(value ?? "") && v !== "";
  return (
    <div className="set-row flex-wrap">
      <div className="min-w-0 flex-1 basis-[220px]">
        <p className="text-[13.5px] font-medium">{label}</p>
        <p className="section-desc">{desc}</p>
      </div>
      <div className={`flex items-center gap-2 transition-opacity ${checked ? "" : "opacity-60"}`}>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) onSave(Number(v));
          }}
        >
          {prefix && <span className="text-[13px] text-muted">{prefix}</span>}
          <input
            type="number"
            step={step}
            min="0"
            value={v}
            onChange={(e) => setV(e.target.value)}
            className="inp !w-[104px] !min-h-[34px] !py-1 text-right tabular"
            aria-label={`${label} threshold`}
          />
          {suffix && <span className="text-[13px] text-muted">{suffix}</span>}
          {dirty && (
            <Button type="submit" variant="secondary" className="btn-sm">Save</Button>
          )}
        </form>
        <Toggle label={`${label} alerts`} checked={checked} onChange={onToggle} />
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${checked ? "bg-[var(--brand)]" : "bg-[var(--border)]"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
