import { Prisma } from "@prisma/client";

export type Currency = "USD" | "IQD";

export const D = (v: Prisma.Decimal.Value | null | undefined) =>
  new Prisma.Decimal(v ?? 0);

export const toNum = (v: Prisma.Decimal.Value | null | undefined): number =>
  D(v).toNumber();

/**
 * Normalize an amount to its USD equivalent.
 *
 * Sales and purchases can be recorded in either USD or IQD, so any report that
 * adds them together must convert first. We always prefer the rate the
 * transaction was written with (history must never re-price itself) and fall
 * back to the current singleton rate when the row has none.
 */
export function toUsd(
  amount: Prisma.Decimal.Value | null | undefined,
  currency: string | null | undefined,
  txRate?: Prisma.Decimal.Value | null,
  fallbackRate?: Prisma.Decimal.Value | null
): Prisma.Decimal {
  const a = D(amount);
  if (currency !== "IQD") return a;
  const rate = D(txRate ?? 0).gt(0) ? D(txRate) : D(fallbackRate ?? 0);
  return rate.gt(0) ? a.div(rate) : a;
}

/** Format money for display. IQD shows 0 decimals, USD 2. */
export function fmtMoney(v: Prisma.Decimal.Value | number | string | null | undefined, currency?: string): string {
  const n = D(v as Prisma.Decimal.Value).toNumber();
  const dec = currency === "IQD" ? 0 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function fmtKg(v: Prisma.Decimal.Value | number | string | null | undefined): string {
  const n = D(v as Prisma.Decimal.Value).toNumber();
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${fmtDate(dt)} ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Normalize a date-only input (YYYY-MM-DD) to a UTC-midnight Date for storage. */
export function parseDateInput(s: string | undefined | null): Date {
  if (!s) return new Date();
  const d = new Date(`${s}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function toDateInput(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}
