import { prisma } from "./db";
import { D } from "./money";
import { getSettings } from "./settings";
import { getVaults } from "./vault";

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
    const customers = await prisma.customer.findMany({ include: { sales: true, payments: true } });
    for (const c of customers) {
      const due = c.sales.reduce((acc, sale) => acc.plus(D(sale.dueAmount)), D(0))
        .minus(c.payments.reduce((acc, p) => acc.plus(D(p.amount)), D(0)));
      if (due.gt(D(s.customerDueThreshold))) {
        toCreate.push({
          type: "CUSTOMER_DUE",
          severity: "danger",
          message: `Customer ${c.fullName} owes factory $${due.toFixed(2)}`,
          linkTo: `/customers/${c.id}`,
        });
      }
    }
  }

  if (s.alertBeneficiaryDue) {
    const beneficiaries = await prisma.beneficiary.findMany({ include: { purchases: true, payments: true } });
    for (const b of beneficiaries) {
      const due = b.purchases.reduce((acc, p) => acc.plus(D(p.dueAmount)), D(0))
        .minus(b.payments.reduce((acc, p) => acc.plus(D(p.amount)), D(0)));
      if (due.gt(D(s.beneficiaryDueThreshold))) {
        toCreate.push({
          type: "BENEFICIARY_DUE",
          severity: "warning",
          message: `Factory owes ${b.fullName} $${due.toFixed(2)}`,
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
          linkTo: `/inventory`,
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
    const cutoff = new Date(now.getTime() - s.overdueDays * 24 * 60 * 60 * 1000);
    const sales = await prisma.sale.findMany({
      where: { dueAmount: { gt: 0 }, saleDate: { lt: cutoff } },
      include: { customer: true },
    });
    for (const sale of sales) {
      toCreate.push({
        type: "OVERDUE",
        severity: "danger",
        message: `${sale.customer.fullName} has overdue balance since ${sale.saleDate.toISOString().slice(0, 10)}`,
        linkTo: `/customers/${sale.customerId}`,
      });
    }
  }

  if (toCreate.length) {
    await prisma.alert.createMany({ data: toCreate });
  }

  const unread = await prisma.alert.count({ where: { isRead: false } });
  return { unread, created: toCreate.length };
}
