"use client";

/* ==========================================================================
   Report PDF export
   --------------------------------------------------------------------------
   Captures the live <ReportSheet> to an A4-landscape PDF.

   Why capture rather than draw with jsPDF primitives: the sheet is already the
   thing the user is looking at, so rasterising it guarantees the export matches
   the preview — same summary tiles, same chart, same table. The trade-off is a
   canvas render, so we capture once at 2x and slice it into pages.

   Folder saving reuses the same File System Access handle pattern as
   invoice-pdf.ts, under its own IndexedDB key so invoices and reports can be
   routed to different directories.
   ========================================================================== */

import { createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import ReportSheet, { fileSlug, type SheetPayload } from "@/components/ReportSheet";
import { toast } from "@/components/Toast";

/* ---------------- folder handle persistence ---------------- */

const DB_NAME = "alu-invoice-pdfs";
const STORE = "handles";
const DIR_KEY = "reportDir";

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

export async function getReportDir(): Promise<any | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(DIR_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveReportDir(dir: any) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(dir, DIR_KEY);
  } catch {
    /* non-fatal: the user just re-picks next time */
  }
}

export function fsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Ask for a folder to save reports into. Returns its name, or null. */
export async function chooseReportDir(): Promise<string | null> {
  if (!fsAccessSupported()) return null;
  try {
    // @ts-expect-error — showDirectoryPicker is not in the TS DOM lib yet.
    const dir = await window.showDirectoryPicker({ mode: "readwrite", id: "alu-reports" });
    if (!dir) return null;
    await saveReportDir(dir);
    return dir.name as string;
  } catch {
    return null;
  }
}

async function writableDir(): Promise<any | null> {
  const dir = await getReportDir();
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

/* ---------------- geometry ---------------- */

/** A4 landscape at 96dpi. The sheet is authored at exactly this pixel width. */
const PAGE_W_MM = 297;
const PAGE_H_MM = 210;
const PAGE_W_PX = 1123;
const SCALE = 2;

/* ---------------- offscreen mounting ---------------- */

/**
 * Mount `node` off-screen and capture it.
 *
 * The host MUST be attached to the document: html2canvas clones the whole
 * document tree and then looks the target up inside that clone, so a detached
 * container silently produces "Unable to find element in cloned iframe".
 * Position is moved off-screen rather than hidden, because a hidden element has
 * no layout and captures as a blank image.
 */
async function capture(node: ReactNode, width = PAGE_W_PX): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;background:#ffffff;z-index:-1;`;
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  // flushSync forces React to commit before we measure, instead of waiting on
  // the scheduler and racing it.
  flushSync(() => root.render(node));

  // Give the browser a frame to lay out and to finish decoding the logo.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    [...host.querySelectorAll("img")]
      .filter((img) => !img.complete)
      .map((img) => new Promise((res) => { img.onload = img.onerror = res; }))
  );

  const el = host.firstElementChild as HTMLElement | null;
  if (!el) {
    root.unmount();
    host.remove();
    throw new Error("Report sheet failed to render.");
  }

  try {
    const html2canvas = (await import("html2canvas")).default;
    return await html2canvas(el, { scale: SCALE, backgroundColor: "#ffffff", logging: false, windowWidth: width });
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * A header-only variant, repeated on continuation pages.
 *
 * A plain slice would leave pages 2..n with no context — just a wall of table
 * rows. This gives every page after the first the same identity block.
 */
function renderHeaderBand(payload: SheetPayload) {
  return capture(createElement(ReportSheet, { payload, showPageFooter: false, variant: "header" })).catch(() => null);
}

/* ---------------- generation ---------------- */

async function buildPdf(payload: SheetPayload) {
  const { jsPDF } = await import("jspdf");
  const canvas = await capture(createElement(ReportSheet, { payload, showPageFooter: false }));
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });

  // The capture is a raster, so work in canvas pixels and convert via the one
  // scale factor that matters: millimetres per captured pixel.
  const mmPerPx = PAGE_W_MM / canvas.width;
  const pageHpx = PAGE_H_MM / mmPerPx; // pixels of the capture that fit one page
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHpx));
  const band = await renderHeaderBand(payload);
  const bandH = band ? band.height * mmPerPx : 0;

  // Continuation pages lose vertical room to the repeated header, so each one
  // advances through the source by less than a full page.
  const step = Math.max(pageHpx - bandH, pageHpx * 0.4);

  const sliceToDataUrl = (src: HTMLCanvasElement, y: number, h: number) => {
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = Math.max(1, Math.round(h));
    const ctx = out.getContext("2d");
    if (!ctx) return src.toDataURL("image/png");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, Math.round(y), src.width, out.height, 0, 0, src.width, out.height);
    return out.toDataURL("image/png");
  };

  // Page 1 shows the document from the top; every page after it starts partway
  // down and reserves room for the repeated header.
  let y = 0;
  for (let p = 0; p < totalPages; p++) {
    if (p > 0) pdf.addPage();

    const top = p === 0 ? 0 : bandH;
    const room = pageHpx - top;
    const sliceH = Math.min(room, canvas.height - y);
    if (sliceH > 0) {
      pdf.addImage(sliceToDataUrl(canvas, y, sliceH), "PNG", 0, top, PAGE_W_MM, (sliceH * PAGE_W_MM) / canvas.width);
    }
    if (band && p > 0) {
      pdf.addImage(band.toDataURL("image/png"), "PNG", 0, 0, PAGE_W_MM, bandH);
    }

    y += p === 0 ? pageHpx : step;
  }

  // Page numbers + doc identity, drawn natively so they stay crisp.
  for (let i = 0; i < totalPages; i++) {
    pdf.setPage(i + 1);
    pdf.setFontSize(7.5);
    pdf.setTextColor(150, 158, 175);
    pdf.text(`ALU FACTORY · ${payload.title}`, 12, PAGE_H_MM - 6);
    pdf.text(`Page ${i + 1} of ${totalPages}`, PAGE_W_MM - 12, PAGE_H_MM - 6, { align: "right" });
  }

  return pdf;
}

/* ---------------- public API ---------------- */

export type ReportExportResult = "saved" | "downloaded";

/**
 * Render the report and write it as a PDF.
 *
 * Honours the `visibleKeys` already applied to the payload, so the export
 * always matches the columns the user chose in the column picker.
 */
export async function exportReportPdf(
  payload: SheetPayload,
  opts: { mode?: "auto" | "download" } = {}
): Promise<ReportExportResult> {
  const mode = opts.mode ?? "auto";
  const filename = `ALU-Report-${fileSlug(payload)}.pdf`;
  const pdf = await buildPdf(payload);

  if (mode === "auto") {
    const dir = await writableDir();
    if (dir) {
      try {
        const handle = await dir.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        const blob = pdf.output("blob");
        await writable.write(blob);
        await writable.close();
        return "saved";
      } catch {
        // Permission or handle failure — fall through to a normal download.
      }
    }
  }

  pdf.save(filename);
  return "downloaded";
}

/** CSV matching the selected columns, with a summary block above the header. */
export function exportReportCsv(payload: SheetPayload) {
  const visible = payload.visibleKeys?.length
    ? payload.columns.filter((c) => payload.visibleKeys!.includes(c.key))
    : payload.columns;
  const cols = visible.length > 0 ? visible : payload.columns;

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines: string[] = [];

  lines.push([esc("ALU FACTORY"), esc(payload.title)].join(","));
  lines.push([esc("Range"), esc(payload.meta.from && payload.meta.to ? `${payload.meta.from} to ${payload.meta.to}` : "All time")].join(","));
  lines.push([esc("Generated"), esc(new Date(payload.meta.generatedAt).toISOString())].join(","));
  lines.push([esc("Exchange rate"), esc(`1 USD = ${payload.meta.exchangeRate} IQD`)].join(","));
  lines.push("");
  lines.push([esc("SUMMARY")].join(","));
  for (const s of payload.summary) {
    lines.push([esc(s.label), esc(s.value), esc(s.sub ?? "")].join(","));
  }
  lines.push("");
  lines.push(cols.map((c) => esc(c.label)).join(","));
  for (const row of payload.rows) {
    lines.push(cols.map((c) => esc(row[c.key] ?? "")).join(","));
  }
  if (payload.totals) {
    lines.push(cols.map((c) => esc(payload.totals?.[c.key] ?? "")).join(","));
  }
  if (payload.note) {
    lines.push("");
    lines.push([esc("Note"), esc(payload.note)].join(","));
  }

  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ALU-Report-${fileSlug(payload)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("CSV downloaded.", "success");
}
