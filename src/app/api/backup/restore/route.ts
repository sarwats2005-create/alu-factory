import { ok, fail, handler, audit } from "@/lib/api";
import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const BACKUP_DIR = path.join(process.cwd(), "backups");

/**
 * Restore replaces all transactional data from a backup file.
 * The requesting Owner must type-confirm in the UI; this handler performs
 * the destructive operation after validating the payload.
 */
export const POST = handler("settings", async (req, user) => {
  const body = await req.json();
  const filename = String(body.filename || "");

  // Load from server-stored backups
  let payload: any;
  if (filename) {
    try {
      const raw = await fs.readFile(path.join(BACKUP_DIR, filename), "utf-8");
      payload = JSON.parse(raw);
    } catch {
      return fail("Backup file could not be read.", 400, "BACKUP_READ_FAIL");
    }
  } else if (body.data) {
    payload = body.data;
  } else {
    return fail("No backup file provided.", 400, "VALIDATION");
  }

  if (payload.app !== "ALU_FACTORY" || !payload.data) {
    return fail("Invalid backup file format.", 400, "BACKUP_INVALID");
  }

  const d = payload.data;
  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(async (tx) => {
      // Wipe transactional data in FK-safe order
      await tx.vaultTransaction.deleteMany();
      await tx.vaultOperation.deleteMany();
      await tx.saleLineItem.deleteMany();
      await tx.sale.deleteMany();
      await tx.purchase.deleteMany();
      await tx.customerPayment.deleteMany();
      await tx.beneficiaryPayment.deleteMany();
      await tx.lossEvent.deleteMany();
      await tx.inventoryMovement.deleteMany();
      await tx.inventoryItem.deleteMany();
      await tx.customer.deleteMany();
      await tx.beneficiary.deleteMany();

      // Restore
      if (d.customers?.length) await tx.customer.createMany({ data: d.customers });
      if (d.beneficiaries?.length) await tx.beneficiary.createMany({ data: d.beneficiaries });
      if (d.inventoryItems?.length) await tx.inventoryItem.createMany({ data: d.inventoryItems });
      if (d.lossEvents?.length) await tx.lossEvent.createMany({ data: d.lossEvents });
      if (d.inventoryMovements?.length) await tx.inventoryMovement.createMany({ data: d.inventoryMovements });
      if (d.purchases?.length) await tx.purchase.createMany({ data: d.purchases });
      if (d.sales?.length) {
        const { lineItems, ...saleFields } = d.sales[0];
        void lineItems; void saleFields;
        // createMany doesn't support nested includes; flatten
        for (const s of d.sales) {
          const { lineItems: li, ...sale } = s;
          await tx.sale.create({ data: { ...sale, lineItems: { create: li } } });
        }
        void prisma;
      }
      if (d.customerPayments?.length) await tx.customerPayment.createMany({ data: d.customerPayment });
      if (d.beneficiaryPayments?.length) await tx.beneficiaryPayment.createMany({ data: d.beneficiaryPayments });
      if (d.vaultOperations?.length) await tx.vaultOperation.createMany({ data: d.vaultOperations });
      if (d.vaultTransactions?.length) await tx.vaultTransaction.createMany({ data: d.vaultTransactions });

      // Recalculate vault balances from restored transactions
      for (const currency of ["USD", "IQD"]) {
        const agg = await tx.vaultTransaction.aggregate({
          where: { vaultCurrency: currency },
          _sum: { amountIn: true, amountOut: true },
        });
        const balance = Number(agg._sum.amountIn ?? 0) - Number(agg._sum.amountOut ?? 0);
        await tx.vault.update({ where: { currency }, data: { balance } });
      }
    });

    return ok({ success: true });
  } catch (e) {
    console.error("[RESTORE]", e);
    return fail("Restore failed. No changes were applied.", 500);
  } finally {
    await prisma.$disconnect();
  }
});
