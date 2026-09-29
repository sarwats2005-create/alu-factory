"use client";

import { useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { fmtDate, fmtMoney } from "@/lib/money";
import { Button } from "@/components/ui";

export function InvoicePreview({ sale }: { sale: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function downloadPdf() {
    if (!ref.current) return;
    setBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      // A5: 148mm x 210mm
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
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

  const cur = sale.currency === "IQD";
  const rate = sale.exchangeRate ? Number(sale.exchangeRate) : null;

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3 no-print">
        <Button variant="secondary" onClick={() => window.print()}>Print</Button>
        <Button busy={busy} onClick={downloadPdf}>Download PDF</Button>
      </div>

      {/* A5 invoice paper */}
      <div
        ref={ref}
        className="bg-white text-[#1A1F36] p-8 mx-auto"
        style={{ width: "100%", maxWidth: 480, fontFamily: "Inter, sans-serif" }}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-[#1B5DB1] pb-4">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <p className="font-bold text-lg leading-tight">ALU FACTORY</p>
              <p className="text-[10px] text-[#6B7280]">Aluminum Operations Management</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm">{sale.invoiceNo}</p>
            <p className="text-xs text-[#6B7280]">{fmtDate(sale.saleDate)}</p>
          </div>
        </div>

        {/* Customer */}
        <div className="mt-4 text-sm">
          <p className="text-[#6B7280] text-xs uppercase tracking-wide">Customer</p>
          <p className="font-semibold">{sale.customer?.fullName}</p>
          {sale.customer?.phone && <p className="text-[#6B7280] text-xs">{sale.customer.phone}</p>}
        </div>

        {/* Line items */}
        <table className="w-full mt-4 text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0]">
              <th className="text-left py-1.5 font-semibold">SKU</th>
              <th className="text-left py-1.5 font-semibold">Product</th>
              <th className="text-right py-1.5 font-semibold">Wt. (kg)</th>
              <th className="text-right py-1.5 font-semibold">Price</th>
              <th className="text-right py-1.5 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.lineItems?.map((li: any) => (
              <tr key={li.id} className="border-b border-[#F1F5F9]">
                <td className="py-1.5 font-mono">{li.item.sku}</td>
                <td className="py-1.5">{li.item.name}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtMoney(li.weightKg)}</td>
                <td className="py-1.5 text-right tabular-nums">{cur ? fmtMoney(li.unitPrice, "IQD") : `$${fmtMoney(li.unitPrice)}`}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{cur ? fmtMoney(li.lineTotal, "IQD") : `$${fmtMoney(li.lineTotal)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 ml-auto w-1/2 text-sm space-y-1">
          <div className="flex justify-between font-bold border-t border-[#1A1F36] pt-1.5">
            <span>TOTAL</span>
            <span className="tabular-nums">{cur ? `${fmtMoney(sale.totalAmount, "IQD")} IQD` : `$${fmtMoney(sale.totalAmount)}`}</span>
          </div>
          <div className="flex justify-between text-[#1E8A44]">
            <span>CASH PAID</span>
            <span className="tabular-nums">{cur ? `${fmtMoney(sale.cashPaid, "IQD")} IQD` : `$${fmtMoney(sale.cashPaid)}`}</span>
          </div>
          <div className="flex justify-between text-[#D93025] font-semibold">
            <span>DUE BALANCE</span>
            <span className="tabular-nums">{cur ? `${fmtMoney(sale.dueAmount, "IQD")} IQD` : `$${fmtMoney(sale.dueAmount)}`}</span>
          </div>
          {rate && (
            <div className="flex justify-between text-[#6B7280] text-xs">
              <span>EXCHANGE RATE</span>
              <span className="tabular-nums">1 USD = {fmtMoney(rate)} IQD</span>
            </div>
          )}
        </div>

        {/* Signature */}
        <div className="mt-10 pt-2 border-t border-[#E2E8F0] flex justify-between items-end text-xs text-[#6B7280]">
          <span>Authorized: _______________</span>
          <span>Thank you for your business</span>
        </div>
      </div>
    </div>
  );
}
