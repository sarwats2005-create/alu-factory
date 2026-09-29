"use client";

// Invoices Manager — every sale invoice in one place.
//
//  - View opens the standard invoice modal.
//  - Save PDF writes `<invoiceNo>.pdf` into a user-chosen local folder
//    (File System Access API), falling back to a browser download.
//  - Edit appears only within 24 hours of invoice creation; the button
//    disappears once the window closes (the API enforces it too).
//  - Delete reverses inventory + vault effects, same as the POS list.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Skeleton, Pagination } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/Modal";
import { InvoicePreview } from "@/components/Invoice";
import { toast } from "@/components/Toast";
import { fmtDate, fmtMoney } from "@/lib/money";
import {
  saveInvoicePdf,
  chooseInvoiceDir,
  getSavedDir,
  fsAccessSupported,
} from "@/lib/invoice-pdf";

/** The edit window, in ms. */
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Ticks every 30s so Edit buttons and countdowns stay current without a reload. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function editWindowOpen(sale: { createdAt: string | Date }, now: number): boolean {
  const created = new Date(sale.createdAt).getTime();
  return Number.isFinite(created) && now - created < EDIT_WINDOW_MS;
}

/** "editable for 23h 12m" — empty string once the window has closed. */
function editCountdown(sale: { createdAt: string | Date }, now: number): string {
  const created = new Date(sale.createdAt).getTime();
  if (!Number.isFinite(created)) return "";
  const msLeft = created + EDIT_WINDOW_MS - now;
  if (msLeft <= 0) return "";
  const totalMin = Math.ceil(msLeft / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `editable for ${h}h ${String(m).padStart(2, "0")}m`;
  return `editable for ${m}m`;
}

export default function InvoicesPage() {
  const router = useRouter();
  const now = useNow();

  const [sales, setSales] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const [invoice, setInvoice] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // PDF folder
  const [dirName, setDirName] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    getSavedDir().then((d) => setDirName(d?.name ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sales?page=${page}&pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      );
      const data = await res.json();
      setSales(data.sales || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    return sales.reduce(
      (acc, s) => {
        acc.total += Number(s.totalAmount);
        acc.paid += Number(s.cashPaid);
        acc.due += Number(s.dueAmount);
        return acc;
      },
      { total: 0, paid: 0, due: 0 }
    );
  }, [sales]);

  async function pickFolder() {
    if (!fsAccessSupported()) {
      toast("Your browser doesn't support choosing a folder. PDFs will download instead.", "error");
      return;
    }
    try {
      const name = await chooseInvoiceDir();
      if (name) {
        setDirName(name);
        toast(`Invoices will be saved to "${name}".`, "success");
      }
    } catch {
      /* user cancelled */
    }
  }

  async function savePdf(sale: any) {
    try {
      const result = await saveInvoicePdf(sale);
      toast(
        result === "saved"
          ? `${sale.invoiceNo}.pdf saved to ${dirName}.`
          : `${sale.invoiceNo}.pdf downloaded.`,
        "success"
      );
    } catch {
      toast(`Could not generate ${sale.invoiceNo}.pdf.`, "error");
    }
  }

  async function saveAllPdf() {
    setSavingAll(true);
    let okCount = 0;
    try {
      for (const s of sales) {
        try {
          await saveInvoicePdf(s);
          okCount++;
        } catch {
          /* keep going */
        }
      }
      toast(
        `Saved ${okCount} of ${sales.length} invoices${dirName ? ` to ${dirName}` : " (downloads)"}.`,
        "success"
      );
    } finally {
      setSavingAll(false);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sales?id=${deleting.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) toast(data.error || "Delete failed", "error");
      else {
        toast("Invoice deleted — inventory and vault restored.", "success");
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
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">Every invoice on record — save, print, or fix within 24 hours</p>
        </div>
        <div className="flex gap-2 items-center">
          {dirName ? (
            <span className="text-xs text-[#6B7280] hidden sm:inline">Saving to: {dirName}</span>
          ) : null}
          <Button variant="secondary" icon="download" onClick={pickFolder}>
            {dirName ? "Change Folder" : "Choose Folder"}
          </Button>
          <Button icon="receipt" busy={savingAll} onClick={saveAllPdf} disabled={!sales.length}>
            Save All (page)
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            className="inp flex-1 min-w-[200px]"
            placeholder="Search invoice #…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {loading ? (
          <Skeleton rows={8} />
        ) : sales.length === 0 ? (
          <p className="text-sm text-[#6B7280] py-10 text-center">
            No invoices found. Create a sale in Point of Sale to generate your first invoice.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Cash Paid</th>
                    <th className="text-right">Due</th>
                    <th>Vault</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const editable = editWindowOpen(s, now);
                    const countdown = editCountdown(s, now);
                    return (
                      <tr key={s.id}>
                        <td>
                          <span className="code code-strong">{s.invoiceNo}</span>
                        </td>
                        <td>
                          <div>{fmtDate(s.saleDate)}</div>
                          {countdown && (
                            <div className="text-[11px] text-[#1E8A44] font-medium whitespace-nowrap inline-flex items-center gap-1">
                              <Icon name="timer" size={12} /> {countdown}
                            </div>
                          )}
                        </td>
                        <td>
                          <Link className="hover:text-[#1B5DB1]" href={`/customers/${s.customerId}`}>
                            {s.customer.fullName}
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">
                          {s.currency === "IQD"
                            ? `${fmtMoney(s.totalAmount, "IQD")} IQD`
                            : `$${fmtMoney(s.totalAmount)}`}
                        </td>
                        <td className="text-right tabular-nums">
                          {s.currency === "IQD"
                            ? `${fmtMoney(s.cashPaid, "IQD")} IQD`
                            : `$${fmtMoney(s.cashPaid)}`}
                        </td>
                        <td
                          className={`text-right tabular-nums ${
                            Number(s.dueAmount) > 0 ? "text-[#D93025] font-semibold" : ""
                          }`}
                        >
                          {s.currency === "IQD"
                            ? `${fmtMoney(s.dueAmount, "IQD")} IQD`
                            : `$${fmtMoney(s.dueAmount)}`}
                        </td>
                        <td>
                          <Badge kind="blue">{s.vaultCurrency}</Badge>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              className="btn-ghost btn-sm"
                              onClick={async () => {
                                const full = await fetch(`/api/sales/by-id?id=${s.id}`);
                                const d = await full.json();
                                setInvoice(d.sale);
                              }}
                            >
                              View
                            </button>
                            <button className="btn-ghost btn-sm" onClick={() => savePdf(s)}>
                              Save PDF
                            </button>
                            {editable && (
                              <button
                                className="btn-ghost btn-sm"
                                title={countdown}
                                onClick={() => router.push(`/pos?edit=${s.id}`)}
                              >
                                Edit
                              </button>
                            )}
                            <button
                              className="btn-ghost btn-sm text-[#D93025]"
                              onClick={() => setDeleting(s)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
              <p className="text-xs text-[#6B7280]">
                This page: {sales.length} invoice{sales.length === 1 ? "" : "s"} · total{" "}
                ${fmtMoney(totals.total)} · paid ${fmtMoney(totals.paid)} · due $
                {fmtMoney(totals.due)}
              </p>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPage={setPage}
                onPageSize={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          </>
        )}
      </Card>

      {renderModals()}
    </div>
  );

  function renderModals() {
    return (
      <>
        {/* Invoice modal */}
        <Modal open={!!invoice} onClose={() => setInvoice(null)} title={`Invoice ${invoice?.invoiceNo ?? ""}`} wide>
          {invoice && <InvoicePreview sale={invoice} />}
        </Modal>

        {/* Delete confirm */}
        <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete Invoice">
          <p className="text-sm whitespace-pre-line">
            {`Delete ${deleting?.invoiceNo}?

Inventory and vault effects will be reversed. This action cannot be undone.`}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy} onClick={doDelete}>
              Delete Invoice
            </Button>
          </div>
        </Modal>
      </>
    );
  }
}
