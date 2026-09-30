"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { invoiceCss, invoiceHtml, printInvoice } from "@/lib/invoice-pdf";

// On-screen A5 invoice preview.
//
// Renders the EXACT same markup + stylesheet the PDF export uses
// (invoiceHtml / invoiceCss), so the preview is pixel-identical to the
// downloaded file and cannot be restyled by the app's dark-theme overrides —
// every rule in invoiceCss is scoped under .inv-page with hardcoded colors.

export function InvoicePreview({ sale }: { sale: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  // The invoice is pure HTML/CSS from the sale record — memoize so re-renders
  // don't rebuild the string (and so the DOM isn't replaced needlessly).
  const html = useMemo(() => invoiceHtml(sale), [sale]);

  async function downloadPdf() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        // The capture target carries its own scoped styles; the app theme
        // must not bleed into it.
        ignoreElements: (el) => el.classList?.contains("no-print"),
      });
      const img = canvas.toDataURL("image/png");
      // A5: 148mm x 210mm
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5", compress: true });
      const w = 148;
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, w, Math.min(h, 210));
      pdf.save(`${sale.invoiceNo}.pdf`);
    } catch {
      toastSafe("Could not generate PDF. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toastSafe(msg: string, kind: "error" | "success") {
    import("@/components/Toast").then(({ toast }) => toast(msg, kind));
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3 no-print">
        {/* iframe printing: the print document contains only the invoice, so
            app chrome, dark theme and global print CSS cannot interfere. */}
        <Button variant="secondary" onClick={() => printInvoice(sale)}>Print</Button>
        <Button busy={busy} onClick={downloadPdf}>Download PDF</Button>
      </div>

      {/* A5 invoice paper — shared markup, scoped styles */}
      <div className="mx-auto no-print-scale" style={{ width: "fit-content" }}>
        <style dangerouslySetInnerHTML={{ __html: invoiceCss() }} />
        <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
