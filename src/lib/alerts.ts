import { prisma } from "./db";
import { D } from "./money";
import { getSettings } from "./settings";
import { getVaults } from "./vault";
import { customerBalance, beneficiaryBalance, type CurrencyBalance } from "./balances";

/** "$240.00 + 1,500,000 IQD" — each currency as it is actually owed. */
function owed(b: CurrencyBalance) {
  const parts: string[] = [];
  if (b.USD.gt(0)) parts.push(`$${b.USD.toFixed(2)}`);
  if (b.IQD.gt(0)) parts.push(`${Number(b.IQD.toFixed(0)).toLocaleString("en-US")} IQD`);
  return parts.join(" + ") || `$${b.usdEquivalent.toFixed(2)}`;
}

/** Recalculate alerts from current system state (simple, reliable snapshot approach). */
export async function refreshAlerts() {
  const s = await getSettings();
  const now = new Date();

  // Delete and regenerate unread, non-static alerts (read history preserved)
  const generated = await prisma.alert.findMany({ where: { isRead: false } });
  for (const a of generated) {
    await prisma.alert.delete({ where: { id: a.id } });
  }

  const toCreate: {
    type: string;
    severity: string;
    message: string;
    linkTo: string;
  }[] = [];

  if (s.alertCustomerDue) {
    const customers = await prisma.customer.findMany({ select: { id: true, fullName: true } });
    for (const c of customers) {
      const bal = await customerBalance(c.id, D(s.exchangeRate));
      if (bal.usdEquivalent.gt(D(s.customerDueThreshold))) {
        toCreate.push({
          type: "CUSTOMER_DUE",
          severity: "danger",
          message: `Customer ${c.fullName} owes factory ${owed(bal)}`,
          linkTo: `/customers/${c.id}`,
        });
      }
    }
  }

  if (s.alertBeneficiaryDue) {
    const beneficiaries = await prisma.beneficiary.findMany({ select: { id: true, fullName: true } });
    for (const b of beneficiaries) {
      const bal = await beneficiaryBalance(b.id, D(s.exchangeRate));
      if (bal.usdEquivalent.gt(D(s.beneficiaryDueThreshold))) {
        toCreate.push({
          type: "BENEFICIARY_DUE",
          severity: "warning",
          message: `Factory owes ${b.fullName} ${owed(bal)}`,
          linkTo: `/beneficiaries/${b.id}`,
        });
      }
    }
  }

  if (s.alertLowStock) {
    const items = await prisma.inventoryItem.findMany();
    for (const item of items) {
      const threshold = item.lowStockKg ? D(item.lowStockKg) : D(s.defaultLowStockKg);
      if (D(item.available).lt(threshold)) {
        toCreate.push({
          type: "LOW_STOCK",
          severity: D(item.available).lte(0) ? "danger" : "warning",
          message: `${item.name} (${item.sku}) stock low — ${D(item.available).toFixed(2)} kg remaining`,
          linkTo: `/inventory/${item.id}`,
        });
      }
    }
  }

  // A vault in deficit is always flagged (spec: negative balance → alert).
  {
    const { USD, IQD } = await getVaults();
    for (const v of [USD, IQD]) {
      if (D(v.balance).lt(0)) {
        toCreate.push({
          type: "VAULT_LOW",
          severity: "danger",
          message: `${v.currency} vault is in deficit: ${v.currency === "USD" ? "-$" + D(v.balance).abs().toFixed(2) : "-" + D(v.balance).abs().toFixed(0) + " IQD"}`,
          linkTo: `/vault`,
        });
      }
    }
  }

  if (s.alertVaultLow) {
    const { USD, IQD } = await getVaults();
    const usdEq = D(USD.balance).plus(D(IQD.balance).div(D(s.exchangeRate)));
    if (usdEq.lt(D(s.vaultLowThresholdUsd))) {
      toCreate.push({
        type: "VAULT_LOW",
        severity: "warning",
        message: `Vault balance below threshold — USD equivalent $${usdEq.toFixed(2)}`,
        linkTo: `/vault`,
      });
    }
  }

  if (s.alertOverdue) {
    // Payments are applied to the oldest invoices first (per currency), so an
    // invoice settled by a later payment is never reported as overdue.
    const cutoff = new Date(now.getTime() - s.overdueDays * 24 * 60 * 60 * 1000);
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        fullName: true,
        sales: { where: { dueAmount: { gt: 0 } }, select: { saleDate: true, dueAmount: true, currency: true }, orderBy: { saleDate: "asc" } },
        payments: { select: { amount: true, currency: true } },
      },
    });
    for (const c of customers) {
      let oldest: Date | null = null;
      for (const cur of ["USD", "IQD"]) {
        let credit = c.payments.filter((p) => p.currency === cur).reduce((a, p) => a.plus(D(p.amount)), D(0));
        for (const sale of c.sales.filter((x) => x.currency === cur)) {
          const open = D(sale.dueAmount).minus(credit);
          credit = open.lt(0) ? open.abs() : D(0);
          if (open.gt(0) && sale.saleDate < cutoff && (!oldest || sale.saleDate < oldest)) oldest = sale.saleDate;
        }
      }
      if (oldest) {
        const days = Math.floor((now.getTime() - oldest.getTime()) / 86_400_000);
        toCreate.push({
          type: "OVERDUE",
          severity: "danger",
          message: `${c.fullName} has an unpaid invoice from ${oldest.toISOString().slice(0, 10)} (${days} days)`,
          linkTo: `/customers/${c.id}`,
        });
      }
    }
  }

  if (toCreate.length) {
    await prisma.alert.createMany({ data: toCreate });
  }

  const unread = await prisma.alert.count({ where: { isRead: false } });
  return { unread, created: toCreate.length };
}
