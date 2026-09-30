"use client";

import { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { fmtDate, fmtMoney } from "@/lib/money";

/* ---------- Money in either currency ---------- */

export function money(v: number | string, currency: string) {
  const n = Number(v) || 0;
  return currency === "IQD" ? `${fmtMoney(n, "IQD")} IQD` : `$${fmtMoney(n)}`;
}

export interface Balance {
  USD: string;
  IQD: string;
  usdEquivalent: string;
}

/** "$240.00 + 1,500,000 IQD" — each currency as it is actually owed; "$0.00" when settled. */
export function balanceText(b: Balance | null | undefined, sign: "owed" | "credit" = "owed") {
  if (!b) return "$0.00";
  const pick = (v: string) => (sign === "owed" ? Number(v) > 0 : Number(v) < 0);
  const parts: string[] = [];
  if (pick(b.USD)) parts.push(money(Math.abs(Number(b.USD)), "USD"));
  if (pick(b.IQD)) parts.push(money(Math.abs(Number(b.IQD)), "IQD"));
  return parts.join(" + ") || "$0.00";
}

/* ---------- "What will happen" preview ---------- */

export interface Impact {
  icon: IconName;
  tone?: "in" | "out" | "neutral" | "warn";
  text: ReactNode;
}

/**
 * A plain-language list of the concrete effects of the form being filled in —
 * stock, cash, who owes whom — shown before the user confirms. People trust
 * what they can predict; this removes the guesswork from every transaction.
 */
export function ImpactList({ title = "What will happen", items }: { title?: string; items: Impact[] }) {
  if (!items.length) return null;
  return (
    <div className="impact" role="status" aria-live="polite">
      <p className="impact-title">
        <Icon name="eye" size={13} />
        {title}
      </p>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={`impact-${it.tone ?? "neutral"}`}>
            <span className="impact-icon">
              <Icon name={it.icon} size={14} />
            </span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Jargon, explained where it appears ---------- */

export const TERMS: Record<string, string> = {
  cogs: "Cost of goods sold — what the aluminum you sold originally cost you to buy.",
  gross: "Gross profit — sales minus what the sold metal cost you.",
  loss: "Processing loss — metal lost when cutting or melting, valued at what you paid for it.",
  net: "Net profit — what the business actually made: sales minus the cost of the metal sold and the metal lost.",
  receivable: "Receivable — money customers still owe you for invoices.",
  payable: "Payable — money you still owe suppliers (beneficiaries) for purchases.",
  due: "Due — the part of an invoice or purchase that has not been paid yet.",
  credit: "Credit — a customer paid more than they owed; you hold that money for them.",
};

export function Term({ k, children }: { k: keyof typeof TERMS; children: ReactNode }) {
  return (
    <span className="term" title={TERMS[k]} tabIndex={0} aria-label={`${typeof children === "string" ? children : ""}: ${TERMS[k]}`}>
      {children}
    </span>
  );
}

/* ---------- Account statement (ledger) ---------- */

export interface LedgerRow {
  id: string;
  kind: "INVOICE" | "PAID_AT_SALE" | "PAYMENT" | "PURCHASE" | "PAID_AT_PURCHASE";
  date: string;
  reference: string;
  description: string;
  currency: string;
  charge: string;
  paid: string;
  balance: string;
  paymentId?: string;
}

/**
 * Oldest-first statement with a running balance — reads top to bottom like a
 * bank statement, so anyone can see exactly how the balance was reached.
 */
export function AccountStatement({
  rows,
  side,
  onUndoPayment,
}: {
  rows: LedgerRow[];
  /** customer: balance = customer owes factory. beneficiary: balance = factory owes beneficiary. */
  side: "customer" | "beneficiary";
  onUndoPayment?: (row: LedgerRow) => void;
}) {
  const multi = new Set(rows.map((r) => r.currency)).size > 1;
  const chargeLabel = side === "customer" ? "Invoiced" : "Bought";
  const owesLabel = side === "customer" ? "Customer owes" : "Factory owes";

  if (!rows.length) {
    return (
      <p className="text-sm text-muted py-6 text-center">
        {side === "customer" ? "No invoices or payments yet." : "No purchases or payments yet."}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th>Reference</th>
            <th>Description</th>
            <th className="text-right">{chargeLabel}</th>
            <th className="text-right">Paid</th>
            <th className="text-right">Balance{multi ? "" : ` (${owesLabel.toLowerCase()})`}</th>
            {onUndoPayment && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bal = Number(r.balance);
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                <td><span className="code">{r.reference}</span></td>
                <td>
                  <span className="flex items-center gap-2">
                    <Icon
                      name={r.kind === "INVOICE" || r.kind === "PURCHASE" ? "file" : "wallet"}
                      size={14}
                      className={r.kind === "INVOICE" || r.kind === "PURCHASE" ? "text-faint shrink-0" : "text-success shrink-0"}
                    />
                    {r.description}
                  </span>
                </td>
                <td className="text-right tabular-nums">{Number(r.charge) > 0 ? money(r.charge, r.currency) : <span className="text-faint">—</span>}</td>
                <td className="text-right tabular-nums text-success">{Number(r.paid) > 0 ? `−${money(r.paid, r.currency)}` : <span className="text-faint">—</span>}</td>
                <td className={`text-right tabular-nums font-semibold ${bal > 0 ? "text-danger" : bal < 0 ? "text-success" : ""}`}>
                  {money(Math.abs(bal), r.currency)}
                  {bal < 0 && <span className="unit">credit</span>}
                  {bal === 0 && <span className="unit">settled</span>}
                </td>
                {onUndoPayment && (
                  <td className="text-right">
                    {r.paymentId && (
                      <button className="btn btn-ghost btn-sm is-danger" onClick={() => onUndoPayment(r)} title="Undo this payment">
                        Undo
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[12px] text-muted mt-3 leading-relaxed">
        How to read this: each <strong>{chargeLabel.toLowerCase()}</strong> amount adds to the balance, each <strong>payment</strong> takes it
        down. The last line is the current balance{side === "customer" ? " the customer owes the factory" : " the factory owes this beneficiary"}.
        {multi && " USD and IQD are tracked separately — each row's balance is in that row's currency."}
      </p>
    </div>
  );
}
