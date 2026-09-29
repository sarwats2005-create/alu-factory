"use client";

// Shared invoice PDF generation + local-folder saving.
//
// Two output modes:
//  1. Browser download (default) — works everywhere.
//  2. Direct write into a user-picked directory via the File System Access
//     API (Chromium). The picked handle is remembered in IndexedDB so the
//     user chooses the folder once and every later save lands there,
//     named `<invoiceNo>.pdf`.

import { fmtDate, fmtMoney } from "@/lib/money";

const DB_NAME = "alu-invoice-pdfs";
const STORE = "handles";
const DIR_KEY = "invoiceDir";

/* ---------------- folder handle persistence ---------------- */

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getSavedDir(): Promise<any | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(DIR_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

async function saveDir(dir: any) {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(dir, DIR_KEY);
}

export function fsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Ask the user for a folder and remember it. Returns a display name or null. */
export async function chooseInvoiceDir(): Promise<string | null> {
  if (!fsAccessSupported()) return null;
  // @ts-expect-error — showDirectoryPicker is not in the TS DOM lib yet.
  const dir = await window.showDirectoryPicker({ mode: "readwrite", id: "alu-invoices" });
  if (!dir) return null;
  await saveDir(dir);
  return dir.name as string;
}

/** Verify (and request) write permission on the stored handle. */
async function writableDir(): Promise<any | null> {
  const dir = await getSavedDir();
  if (!dir) return null;
  try {
    const opts = { mode: "readwrite" } as const;
    if ((await dir.queryPermission(opts)) !== "granted") {
      if ((await dir.requestPermission(opts)) !== "granted") return null;
    }
    return dir;
  } catch {
    return null;
  }
}

/* ---------------- invoice HTML (A5 paper) ---------------- */

function invoiceHtml(sale: any): string {
  const cur = sale.currency === "IQD";
  const rate = sale.exchangeRate ? Number(sale.exchangeRate) : null;
  const money = (v: any) => (cur ? `${fmtMoney(v, "IQD")} IQD` : `$${fmtMoney(v)}`);
  const rateRow = rate
    ? `<tr><td style="color:#6B7280;font-size:10px">EXCHANGE RATE</td><td style="text-align:right">1 USD = ${fmtMoney(rate)} IQD</td></tr>`
    : "";

  return `
  <div style="background:#ffffff;color:#1A1F36;padding:32px;width:480px;font-family:Inter,Arial,sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1B5DB1;padding-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="/app-icon.png" width="44" height="44" style="border-radius:10px" />
        <div>
          <div style="font-weight:700;font-size:18px;line-height:1.2">ALU FACTORY</div>
          <div style="font-size:10px;color:#6B7280">Aluminum Operations Management</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;font-size:14px">${sale.invoiceNo}</div>
        <div style="font-size:12px;color:#6B7280">${fmtDate(sale.saleDate)}</div>
      </div>
    </div>
    <div style="margin-top:16px;font-size:14px">
      <div style="color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Customer</div>
      <div style="font-weight:600">${sale.customer?.fullName ?? ""}</div>
      ${sale.customer?.phone ? `<div style="font-size:12px;color:#6B7280">${sale.customer.phone}</div>` : ""}
    </div>
    <table style="width:100%;margin-top:16px;font-size:12px;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid #E2E8F0">
        <th style="text-align:left;padding:6px 0;font-weight:600">SKU</th>
        <th style="text-align:left;padding:6px 0;font-weight:600">Product</th>
        <th style="text-align:right;padding:6px 0;font-weight:600">Wt. (kg)</th>
        <th style="text-align:right;padding:6px 0;font-weight:600">Price</th>
        <th style="text-align:right;padding:6px 0;font-weight:600">Total</th>
      </tr></thead>
      <tbody>
        ${(sale.lineItems ?? [])
          .map(
            (li: any) => `<tr style="border-bottom:1px solid #F1F5F9">
          <td style="padding:6px 0;font-family:monospace">${li.item?.sku ?? ""}</td>
          <td style="padding:6px 0">${li.item?.name ?? ""}</td>
          <td style="padding:6px 0;text-align:right">${fmtMoney(li.weightKg)}</td>
          <td style="padding:6px 0;text-align:right">${money(li.unitPrice)}</td>
          <td style="padding:6px 0;text-align:right;font-weight:500">${money(li.lineTotal)}</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>
    <table style="margin-top:16px;margin-left:auto;width:50%;font-size:14px;border-collapse:collapse">
      <tr style="border-top:1px solid #1A1F36;font-weight:700"><td style="padding:6px 0">TOTAL</td><td style="text-align:right">${money(sale.totalAmount)}</td></tr>
      <tr><td style="padding:4px 0;color:#1E8A44">CASH PAID</td><td style="text-align:right;color:#1E8A44">${money(sale.cashPaid)}</td></tr>
      <tr><td style="padding:4px 0;color:#D93025;font-weight:600">DUE BALANCE</td><td style="text-align:right;color:#D93025;font-weight:600">${money(sale.dueAmount)}</td></tr>
      ${rateRow}
    </table>
    <div style="margin-top:40px;padding-top:8px;border-top:1px solid #E2E8F0;display:flex;justify-content:space-between;font-size:12px;color:#6B7280">
      <span>Authorized: _______________</span><span>Thank you for your business</span>
    </div>
  </div>`;
}


/* ---------------- rendering + output ---------------- */

async function renderCanvas(sale: any): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#ffffff";
  host.innerHTML = invoiceHtml(sale);
  document.body.appendChild(host);
  try {
    return await html2canvas(host, { scale: 2, backgroundColor: "#ffffff" });
  } finally {
    host.remove();
  }
}

async function canvasToPdf(canvas: HTMLCanvasElement) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const w = 148;
  const h = (canvas.height * w) / canvas.width;
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, Math.min(h, 210));
  return pdf;
}

/**
 * Save an invoice PDF named after its invoice number.
 * Writes into the previously chosen folder when possible; otherwise falls
 * back to a normal browser download.
 */
export async function saveInvoicePdf(
  sale: any,
  opts: { mode?: "auto" | "download" } = {}
): Promise<"saved" | "downloaded"> {
  const mode = opts.mode ?? "auto";
  const canvas = await renderCanvas(sale);
  const pdf = await canvasToPdf(canvas);
  const filename = `${sale.invoiceNo}.pdf`;

  if (mode === "auto") {
    const dir = await writableDir();
    if (dir) {
      const handle = await dir.getFileHandle(filename, { create: true });
      const writable = await handle.createWritable();
      const blob: Blob = await new Promise((res) => pdf.output("blob") && res(pdf.output("blob")));
      await writable.write(blob);
      await writable.close();
      return "saved";
    }
  }
  pdf.save(filename);
  return "downloaded";
}
