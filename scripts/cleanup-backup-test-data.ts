/**
 * One-off cleanup of rows left behind by the backup round-trip test.
 *
 * The test deliberately creates and then restores data. When a restore fails
 * part-way the test rows can survive, and the REST API refuses to delete a
 * customer that still has sales (by design), so this removes them directly and
 * then re-derives inventory availability from the movement ledger.
 *
 *   npx tsx scripts/cleanup-backup-test-data.ts
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/** Marks written by scripts/backup-smoke.mjs. */
const TEST_MARK = /BACKUPTEST/;

async function main() {
  /* ---- sales, by note or by owning a test customer ---- */
  const testCustomers = await prisma.customer.findMany({
    where: { fullName: { contains: "BACKUPTEST" } },
    select: { id: true, fullName: true },
  });
  const testCustomerIds = new Set(testCustomers.map((c) => c.id));

  const sales = await prisma.sale.findMany({
    where: {
      OR: [
        { notes: { contains: "BACKUPTEST" } },
        ...(testCustomerIds.size ? [{ customerId: { in: [...testCustomerIds] } }] : []),
      ],
    },
    select: { id: true, invoiceNo: true },
  });

  for (const s of sales) {
    await prisma.$transaction(async (tx) => {
      await tx.vaultTransaction.deleteMany({ where: { saleId: s.id } });
      await tx.sale.delete({ where: { id: s.id } });
    });
    console.log(`removed sale ${s.invoiceNo}`);
  }

  /* ---- payments against test customers ---- */
  const pays = await prisma.customerPayment.findMany({
    where: {
      OR: [
        { reference: { contains: "BACKUPTEST" } },
        ...(testCustomerIds.size ? [{ customerId: { in: [...testCustomerIds] } }] : []),
      ],
    },
    select: { id: true, reference: true },
  });
  for (const p of pays) {
    await prisma.$transaction(async (tx) => {
      await tx.vaultTransaction.deleteMany({ where: { customerPaymentId: p.id } });
      await tx.customerPayment.delete({ where: { id: p.id } });
    });
    console.log(`removed customer payment ${p.reference || p.id}`);
  }

  for (const c of testCustomers) {
    await prisma.customer.delete({ where: { id: c.id } });
    console.log(`removed customer ${c.fullName}`);
  }

  /* ---- rebuild availability from the movement ledger ----
     A restore copies `available` verbatim from the backup, so if the backup
     itself was taken while test sales existed, the on-hand figure carries
     their consumption. Re-deriving it removes that residue. */
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, sku: true, name: true, available: true, movements: { select: { direction: true, qtyKg: true } } },
  });
  for (const it of items) {
    const total = it.movements.reduce(
      (acc, m) => acc.plus(m.direction === "IN" ? new Prisma.Decimal(m.qtyKg) : new Prisma.Decimal(m.qtyKg).neg()),
      new Prisma.Decimal(0)
    );
    if (Math.abs(total.toNumber() - Number(it.available)) > 0.001) {
      await prisma.inventoryItem.update({ where: { id: it.id }, data: { available: total } });
      console.log(`rebuilt ${it.sku} availability: ${it.available} → ${total.toFixed(2)} kg`);
    } else {
      console.log(`ok       ${it.sku} availability ${total.toFixed(2)} kg`);
    }
  }

  /* ---- vault balances from the ledger ---- */
  for (const v of await prisma.vault.findMany()) {
    const agg = await prisma.vaultTransaction.aggregate({
      where: { vaultCurrency: v.currency },
      _sum: { amountIn: true, amountOut: true },
    });
    const expected = new Prisma.Decimal(agg._sum.amountIn ?? 0).minus(new Prisma.Decimal(agg._sum.amountOut ?? 0));
    if (Math.abs(expected.toNumber() - Number(v.balance)) > 0.001) {
      await prisma.vault.update({ where: { currency: v.currency }, data: { balance: expected } });
      console.log(`rebuilt ${v.currency} vault: ${v.balance} → ${expected.toFixed(2)}`);
    } else {
      console.log(`ok       ${v.currency} vault ${expected.toFixed(2)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());