"use client";

// Shared invoice PDF generation + local-folder saving.
//
// Two output modes:
//  1. Browser download (default) — works everywhere.
//  2. Direct write into a user-picked directory via the File System Access
//     API (Chromium). The picked handle is remembered in IndexedDB so the
//     user chooses the folder once and every later save lands there,
//     named `<invoiceNo>.pdf`.
//
// The template below is the approved ALU FACTORY invoice design: blue header
// band, gradient accent strip, customer band, banded line-item table, boxed
// totals (green cash / red due) and a signature footer. It is authored at
// 480px wide and rendered to A5 portrait via jsPDF.

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

/**
 * The approved invoice design. Every color comes from the brand token list;
 * no approximations. Product names can be Arabic/Kurdish, so the container
 * sets `unicode-bidi: plaintext` to render RTL text correctly.
 */
function invoiceHtml(sale: any): string {
  const cur = sale.currency === "IQD";
  const money = (v: any) => (cur ? `${fmtMoney(v, "IQD")} IQD` : `$${fmtMoney(v)}`);

  const due = Number(sale.dueAmount ?? 0);
  const duePositive = due > 0;
  const dueRowClass = duePositive ? "due-row-positive" : "due-row-zero";
  const rows = (sale.lineItems ?? [])
    .map(
      (li: any, i: number) => `
      <tr class="${i % 2 === 1 ? "odd" : "even"}">
        <td class="c-sku"><span class="sku-badge">${esc(li.item?.sku ?? "")}</span></td>
        <td class="c-product">${esc(li.item?.name ?? "")}</td>
        <td>${fmtMoney(li.weightKg)} kg</td>
        <td>${money(li.unitPrice)}</td>
        <td class="c-total">${money(li.lineTotal)}</td>
      </tr>`
    )
    .join("");

  return `
  <div class="page" dir="ltr">
    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        <div class="inv-number">${esc(sale.invoiceNo)}</div>
        <div class="inv-date">${fmtDate(sale.saleDate)}</div>
      </div>
      <div class="header-center">
        <div class="brand-name">ALU FACTORY</div>
        <div class="brand-sub">Aluminum Operations Management</div>
      </div>
      <div class="header-right">
        <div class="logo-box">
          <img src="/app-icon.png" alt="ALU FACTORY Logo"
               onerror="this.style.display='none'" />
        </div>
      </div>
    </div>

    <!-- ACCENT STRIP -->
    <div class="accent-strip"></div>

    <!-- CUSTOMER BAND -->
    <div class="customer-band">
      <div>
        <div class="label">Bill To</div>
        <div class="name">${esc(sale.customer?.fullName ?? "")}</div>
      </div>
      <div class="inv-badge">Invoice #${esc(sale.invoiceNo)}</div>
    </div>

    <!-- LINE ITEMS TABLE -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="th-left">SKU</th>
            <th>Product</th>
            <th>Weight (kg)</th>
            <th>Unit Price</th>
            <th class="th-right">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- TOTALS -->
    <div class="totals-wrap">
      <div class="totals-box">
        <div class="totals-row total-row">
          <span class="t-label">Total</span>
          <span class="t-value">${money(sale.totalAmount)}</span>
        </div>
        <div class="totals-row banded">
          <span class="t-label">Cash Paid</span>
          <span class="t-value cash">${money(sale.cashPaid)}</span>
        </div>
        <div class="totals-row ${dueRowClass}">
          <span class="t-label">Due Balance${duePositive ? '<span class="due-sub">Customer owes factory</span>' : ""}</span>
          <span class="t-value due">${money(sale.dueAmount)}</span>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="thank-you">Thank you for your business.</div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signature</div>
      </div>
    </div>

    <!-- BOTTOM BAR -->
    <div class="footer-bar"></div>
  </div>`;
}

/** Escape untrusted strings (customer names, product names, SKUs). */
function esc(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------------- rendering + output ---------------- */

async function renderCanvas(sale: any): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#ffffff";
  host.innerHTML = `
    <style>${invoiceCss()}</style>
    ${invoiceHtml(sale)}`;
  document.body.appendChild(host);

  // Let layout settle and decode the logo before capturing.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (document.fonts?.ready) await document.fonts.ready;

  try {
    return await html2canvas(host.firstElementChild as HTMLElement, {
      scale: 2,
      backgroundColor: "#ffffff",
    });
  } finally {
    host.remove();
  }
}

async function canvasToPdf(canvas: HTMLCanvasElement) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5", compress: true });
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

/* ---------------- stylesheet (brand tokens, no approximations) ---------------- */

function invoiceCss(): string {
  return `
  :root {
    --blue:       #1B5DB1;
    --blue-dark:  #143F7A;
    --blue-light: #E8F0FB;
    --blue-mid:   #D0E1F9;
    --stripe:     #F4F8FF;
    --border:     #D8E6F7;
    --text:       #1A1F36;
    --muted:      #6B7280;
    --green:      #1E8A44;
    --red:        #D93025;
    --white:      #FFFFFF;
  }

  .page {
    width: 480px;
    background: var(--white);
    color: var(--text);
    font-family: Inter, Arial, sans-serif;
  }

  /* ---- 1. HEADER ---- */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--blue);
    padding: 28px 32px;
  }
  .inv-number {
    font-size: 22px;
    font-weight: 800;
    color: var(--white);
    letter-spacing: -0.5px;
  }
  .inv-date {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
    font-weight: 400;
    margin-top: 2px;
  }
  .header-center {
    flex: 1;
    text-align: center;
  }
  .brand-name {
    font-size: 20px;
    font-weight: 800;
    color: var(--white);
    letter-spacing: 1px;
  }
  .brand-sub {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 400;
    letter-spacing: 0.3px;
    margin-top: 2px;
  }
  .logo-box {
    width: 56px;
    height: 56px;
    background: var(--white);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .logo-box img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: 8px;
  }

  /* ---- 2. ACCENT STRIP ---- */
  .accent-strip {
    height: 4px;
    background: linear-gradient(90deg, var(--blue-dark) 0%, #4A90D9 60%, var(--blue-mid) 100%);
  }

  /* ---- 3. CUSTOMER BAND ---- */
  .customer-band {
    background: var(--blue-light);
    padding: 16px 32px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .label {
    font-size: 10px;
    font-weight: 600;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .name {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
    margin-top: 2px;
    unicode-bidi: plaintext;
  }
  .inv-badge {
    background: var(--blue);
    color: var(--white);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 20px;
    white-space: nowrap;
  }

  /* ---- 4. LINE ITEMS TABLE ---- */
  .table-wrap { padding: 24px 32px 0; }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead tr { background: var(--blue); }
  th {
    padding: 11px 14px;
    font-size: 11px;
    font-weight: 600;
    color: var(--white);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    text-align: center;
  }
  th.th-left { text-align: left; }
  th.th-right { text-align: right; }
  td {
    padding: 12px 14px;
    font-size: 13px;
    color: var(--text);
    text-align: center;
    vertical-align: middle;
    border-bottom: 1px solid var(--border);
  }
  tr.odd td { background: var(--white); }
  tr.even td { background: var(--stripe); }
  td.c-sku { text-align: left; }
  .sku-badge {
    display: inline-block;
    background: var(--blue-light);
    color: var(--blue);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 4px;
    border: 1px solid var(--border);
    letter-spacing: 0.3px;
    font-family: monospace;
  }
  td.c-product {
    font-weight: 500;
    unicode-bidi: plaintext;
  }
  td.c-total {
    font-weight: 600;
    text-align: right;
  }

  /* ---- 5. TOTALS BOX ---- */
  .totals-wrap { padding: 16px 32px 24px; }
  .totals-box {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 18px;
    border-bottom: 1px solid var(--border);
  }
  .totals-row:last-child { border-bottom: none; }
  .total-row {
    background: var(--blue-light);
    border-top: 2px solid var(--blue);
  }
  .total-row .t-label {
    font-weight: 700;
    color: var(--blue-dark);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 13px;
  }
  .total-row .t-value {
    font-size: 18px;
    font-weight: 800;
    color: var(--blue-dark);
  }
  .totals-row.banded { background: var(--stripe); }
  .t-label {
    font-weight: 500;
    color: var(--muted);
    font-size: 13px;
  }
  .t-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .t-value.cash { color: var(--green); }
  .t-value.due { color: var(--muted); }
  .due-row-positive .t-value.due {
    color: var(--red);
    font-weight: 700;
  }
  .due-sub {
    display: block;
    font-size: 10px;
    color: var(--red);
    font-weight: 500;
    margin-top: 2px;
  }

  /* ---- 6. FOOTER ---- */
  .footer {
    border-top: 1px solid var(--border);
    background: var(--blue-light);
    padding: 18px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer .thank-you {
    font-size: 12px;
    color: var(--muted);
    font-style: italic;
  }
  .footer .sig-block { text-align: right; }
  .footer .sig-line {
    width: 140px;
    height: 1px;
    background: var(--blue);
    margin-bottom: 5px;
    margin-left: auto;
  }
  .footer .sig-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--blue);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  /* ---- 7. FOOTER BAR ---- */
  .footer-bar {
    height: 6px;
    background: var(--blue);
  }
  `;
}
