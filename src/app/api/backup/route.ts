import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { Prisma } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), "backups");

async function ensureDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

// Tables to back up (order matters for restore due to relations)
const TABLES = [
  "setting", "vault", "user", "userPermission", "exchangeRateLog", "aluminumType",
  "customer", "beneficiary", "inventoryItem", "lossEvent", "inventoryMovement",
  "purchase", "sale", "saleLineItem", "customerPayment", "beneficiaryPayment",
  "vaultTransaction", "vaultOperation", "alert", "auditLog", "backup",
] as const;

async function exportAll(): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  data.users = await prisma.user.findMany({ include: { permissions: true } });
  data.settings = [await getSettings()];
  data.vaults = await prisma.vault.findMany();
  data.exchangeRateLogs = await prisma.exchangeRateLog.findMany();
  data.aluminumTypes = await prisma.aluminumType.findMany();
  data.customers = await prisma.customer.findMany();
  data.beneficiaries = await prisma.beneficiary.findMany();
  data.inventoryItems = await prisma.inventoryItem.findMany();
  data.lossEvents = await prisma.lossEvent.findMany();
  data.inventoryMovements = await prisma.inventoryMovement.findMany();
  data.purchases = await prisma.purchase.findMany();
  data.sales = await prisma.sale.findMany({ include: { lineItems: true } });
  data.customerPayments = await prisma.customerPayment.findMany();
  data.beneficiaryPayments = await prisma.beneficiaryPayment.findMany();
  data.vaultOperations = await prisma.vaultOperation.findMany();
  data.vaultTransactions = await prisma.vaultTransaction.findMany();
  return data;
}

export const GET = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);

  const url = new URL(req.url);
  if (url.searchParams.get("action") === "export") {
    const data = await exportAll();
    const payload = { app: "ALU_FACTORY", version: 1, exportedAt: new Date().toISOString(), data };
    const filename = `alu-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await ensureDir();
    await fs.writeFile(path.join(BACKUP_DIR, filename), JSON.stringify(payload, null, 2));
    await prisma.backup.create({
      data: { filename, sizeBytes: JSON.stringify(payload).length, kind: "MANUAL" },
    });
    await audit(user.id, "BACKUP", "SYSTEM", filename);
    return new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // List backups
  const backups = await prisma.backup.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return ok({ backups });
});

export const POST = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  // Create a backup snapshot now
  const data = await exportAll();
  const payload = { app: "ALU_FACTORY", version: 1, exportedAt: new Date().toISOString(), data };
  const filename = `alu-auto-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await ensureDir();
  await fs.writeFile(path.join(BACKUP_DIR, filename), JSON.stringify(payload));
  const backup = await prisma.backup.create({
    data: { filename, sizeBytes: JSON.stringify(payload).length, kind: "AUTO" },
  });
  await audit(user.id, "BACKUP", "SYSTEM", filename);
  return ok({ backup }, 201);
});

export const DELETE = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return fail("Backup id required.", 400);
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) return fail("Backup not found.", 404);
  try {
    await fs.unlink(path.join(BACKUP_DIR, backup.filename));
  } catch {
    /* file already gone */
  }
  await prisma.backup.delete({ where: { id } });
  await audit(user.id, "DELETE", "SYSTEM", backup.filename);
  return ok({ success: true });
});
