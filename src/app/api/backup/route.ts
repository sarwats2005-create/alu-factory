import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { writeBackupFile, readBackupFile, deleteBackupFile, backupFilesWritable } from "@/lib/backup-io";
import { vaultIntegrity } from "@/lib/backup-schema";

/* ==========================================================================
   Backup & restore (export half)
   --------------------------------------------------------------------------
   A full logical dump of the business tables. The matching restore lives in
   `restore/route.ts`; both sides derive their table order from the same list
   so they cannot drift apart.

   Note that the filesystem is not writable on Cloudflare Workers. Disk
   snapshots are therefore a convenience for the self-hosted deployment, not a
   safety net — the portable path is `?action=export`, which streams the JSON
   straight to the browser.
   ========================================================================== */

type BackupData = Record<string, any[]>;

async function exportAll(): Promise<BackupData> {
  const [
    users,
    vaults,
    exchangeRateLogs,
    aluminumTypes,
    customers,
    beneficiaries,
    inventoryItems,
    lossEvents,
    inventoryMovements,
    purchases,
    sales,
    customerPayments,
    beneficiaryPayments,
    vaultOperations,
    vaultTransactions,
  ] = await Promise.all([
    prisma.user.findMany({ include: { permissions: true } }),
    prisma.vault.findMany(),
    prisma.exchangeRateLog.findMany(),
    prisma.aluminumType.findMany(),
    prisma.customer.findMany(),
    prisma.beneficiary.findMany(),
    prisma.inventoryItem.findMany(),
    prisma.lossEvent.findMany(),
    prisma.inventoryMovement.findMany(),
    prisma.purchase.findMany(),
    prisma.sale.findMany({ include: { lineItems: true } }),
    prisma.customerPayment.findMany(),
    prisma.beneficiaryPayment.findMany(),
    prisma.vaultOperation.findMany(),
    prisma.vaultTransaction.findMany(),
  ]);

  return {
    // Users and settings are exported for reference but deliberately NOT
    // replayed by restore: wiping the owner account would lock everyone out,
    // and the live exchange rate should not be rolled back to a stale value.
    settings: [await getSettings()],
    users,
    vaults,
    exchangeRateLogs,
    aluminumTypes,
    customers,
    beneficiaries,
    inventoryItems,
    lossEvents,
    inventoryMovements,
    purchases,
    sales,
    customerPayments,
    beneficiaryPayments,
    vaultOperations,
    vaultTransactions,
  };
}

async function buildPayload() {
  return { app: "ALU_FACTORY", version: 1, exportedAt: new Date().toISOString(), data: await exportAll() };
}

function stamp(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

/* ---------------------------------------------------------------- check */

/** Row counts per table, exposed so the UI can show what a backup contains. */
async function countsOf(data: BackupData) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
}

export const GET = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  /* ---- verify: can each stored backup be trusted right now? ---- */
  if (action === "verify") {
    const [backups, writable] = await Promise.all([
      prisma.backup.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      backupFilesWritable(),
    ]);

    const data = await exportAll();
    const live = await countsOf(data);
    const integrity = vaultIntegrity(data.vaultTransactions ?? [], data.vaults ?? []);

    const results = [];
    for (const b of backups) {
      if (!writable) {
        results.push({ ...pick(b), status: "unavailable", detail: "This host cannot read backup files." });
        continue;
      }
      try {
        const payload = JSON.parse(await readBackupFile(b.filename));
        if (payload?.app !== "ALU_FACTORY" || !payload.data) throw new Error("unrecognised format");
        const stored = await countsOf(payload.data as BackupData);
        const drift = Object.keys(live)
          .filter((k) => stored[k] !== undefined && stored[k] !== live[k])
          .map((k) => `${k} ${stored[k]}→${live[k]}`);
        results.push({
          ...pick(b),
          status: drift.length ? "outdated" : "current",
          detail: drift.length ? `differs from live: ${drift.join(", ")}` : "matches live data",
          exportedAt: payload.exportedAt ?? null,
        });
      } catch (e) {
        results.push({ ...pick(b), status: "unreadable", detail: e instanceof Error ? e.message : String(e) });
      }
    }
    return ok({ live, writable, integrity, results });
  }

  /* ---- export: stream the JSON to the browser and keep a copy on disk ---- */
  if (action === "export") {
    const payload = await buildPayload();
    const json = JSON.stringify(payload, null, 2);
    const filename = stamp("alu-backup");

    // A disk failure must not block the download — that is the one path that
    // works on hosts without a writable filesystem.
    let storedOnDisk = false;
    if (await backupFilesWritable()) {
      try {
        await writeBackupFile(filename, json);
        storedOnDisk = true;
      } catch (e) {
        console.error("[backup] could not write a disk copy:", e);
      }
    }

    await prisma.backup.create({
      data: { filename, sizeBytes: Buffer.byteLength(json), kind: "MANUAL" },
    });
    await audit(user.id, "BACKUP", "SYSTEM", filename);

    if (!storedOnDisk) {
      // No file on disk, so the row would point at nothing. Drop it again.
      await prisma.backup.deleteMany({ where: { filename } });
    }

    return new Response(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Backup-Stored": String(storedOnDisk),
      },
    });
  }

  const backups = await prisma.backup.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const data = await exportAll();
  return ok({
    backups,
    diskWritable: await backupFilesWritable(),
    integrity: vaultIntegrity(data.vaultTransactions, await prisma.vault.findMany()),
  });
});

export const POST = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  if (!(await backupFilesWritable())) {
    return fail("This host cannot store backup files. Use Export JSON instead.", 500, "BACKUP_NO_FS");
  }

  const payload = await buildPayload();
  const json = JSON.stringify(payload);
  const filename = stamp("alu-auto");
  await writeBackupFile(filename, json);
  const backup = await prisma.backup.create({
    data: { filename, sizeBytes: Buffer.byteLength(json), kind: "AUTO" },
  });
  await audit(user.id, "BACKUP", "SYSTEM", filename);
  return ok({ backup }, 201);
});

export const DELETE = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Backup id required.", 400);
  const backup = await prisma.backup.findUnique({ where: { id } });
  if (!backup) return fail("Backup not found.", 404);
  await deleteBackupFile(backup.filename);
  await prisma.backup.delete({ where: { id } });
  await audit(user.id, "DELETE", "SYSTEM", backup.filename);
  return ok({ success: true });
});

function pick(b: { id: string; filename: string; kind: string; createdAt: Date; sizeBytes: number }) {
  return { id: b.id, filename: b.filename, kind: b.kind, createdAt: b.createdAt, sizeBytes: b.sizeBytes };
}