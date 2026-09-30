import { prisma } from "@/lib/db";
import { ok, fail, handler, audit, AppError } from "@/lib/api";
import { D } from "@/lib/money";
import { readBackupFile } from "@/lib/backup-io";
import { RESTORE_ORDER, WIPE_ORDER, MONEY_COLUMNS, INSERT_CHUNK, NESTED_DROP } from "@/lib/backup-schema";

type RestoreResult = {
  sales: number;
  purchases: number;
  customers: number;
  beneficiaries: number;
  inventoryItems: number;
  vaultTransactions: number;
  vault: { before: Record<string, string>; after: Record<string, string>; changed: string[] };
};

/* ==========================================================================
   Restore
   --------------------------------------------------------------------------
   Destructive, so it is built around one guarantee: the whole replay happens
   inside a single transaction. Either the database ends up exactly as the
   backup describes, or it is left untouched. A partial restore would be far
   worse than a failed one.

   Notes on what is deliberately NOT restored:
     · users / permissions — wiping these could remove the owner and lock
       everyone out of the app with no way back in.
     · settings (exchange rate, thresholds) — the live rate should not be
       rolled back to a stale value. Restored transactions carry their own
       exchange rate, so historical reports stay correct either way.
   ========================================================================== */

/**
 * A restore replays every business table. Over a remote Postgres connection
 * that is many round trips, and Prisma's 5s default transaction timeout would
 * abort a perfectly healthy restore part-way through. Same override used by
 * src/lib/transactions.ts, and deliberately longer for this bulk path.
 */
const TX_OPTIONS = { maxWait: 60_000, timeout: 120_000 };

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function chunks<T>(rows: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Prisma writes Decimals from strings returned by JSON.parse. Converting them
 * up front keeps the values exact instead of letting them round-trip through a
 * float, which matters for money.
 */
function numeric<T extends Record<string, any>>(rows: any[]): T[] {
  return rows.map((r) => {
    const out = { ...r };
    for (const k of MONEY_COLUMNS) {
      if (typeof out[k] === "string" || typeof out[k] === "number") out[k] = D(out[k]);
    }
    return out as T;
  });
}

/** Drop keys Prisma assigns itself when the row is written through a parent. */
function stripNested(row: Record<string, any>) {
  const out = { ...row };
  for (const k of NESTED_DROP) delete out[k];
  return out;
}

async function replay(tx: Tx, d: Record<string, any[]>): Promise<RestoreResult> {
  /* ---- 1. clear, children before parents ---- */
  for (const { key, model } of WIPE_ORDER) {
    if (key === "aluminumTypes") continue; // reference data, replaced below
    await (tx as any)[model].deleteMany();
  }

  /* ---- 2. reference data ---- */
  // Aluminum types are a small, self-contained lookup table, so replacing them
  // wholesale keeps the backup authoritative.
  await tx.aluminumType.deleteMany();
  if (d.aluminumTypes?.length) {
    await tx.aluminumType.createMany({ data: d.aluminumTypes.map((t: any) => ({ id: t.id, name: t.name })) });
  }

  /* ---- 3. reinsert in dependency order ---- */
  for (const { key, model } of RESTORE_ORDER) {
    if (key === "aluminumTypes") continue;
    const rows = d[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    if (key === "sales") {
      // createMany cannot nest, so each sale is created with its lines inline.
      for (const s of rows) {
        const { lineItems, ...sale } = s;
        const data: any = numeric([sale])[0];
        // The parent key is assigned by the nesting, so it must not be passed.
        data.lineItems = { create: numeric(lineItems ?? []).map(stripNested) };
        await tx.sale.create({ data });
      }
      continue;
    }

    for (const batch of chunks(numeric(rows))) {
      await (tx as any)[model].createMany({ data: batch });
    }
  }

  /* ---- 4. vault balances must agree with the replayed ledger ---- */
  //
  // Recalculated rather than copied from the file, so a vault can never come
  // back describing money its own ledger does not account for. This is a real
  // correction when the live balance was edited by hand, so the before/after
  // pair is reported back to the caller.
  const vaultBefore: Record<string, string> = {};
  for (const v of await tx.vault.findMany()) vaultBefore[v.currency] = v.balance.toFixed(2);

  const vaultAfter: Record<string, string> = {};
  for (const currency of ["USD", "IQD"]) {
    const agg = await tx.vaultTransaction.aggregate({
      where: { vaultCurrency: currency },
      _sum: { amountIn: true, amountOut: true },
    });
    const balance = D(agg._sum.amountIn ?? 0).minus(D(agg._sum.amountOut ?? 0));
    // upsert, not update: a vault row missing from the database would otherwise
    // throw and abort an otherwise-valid restore.
    await tx.vault.upsert({
      where: { currency },
      create: { currency, balance },
      update: { balance },
    });
    vaultAfter[currency] = balance.toFixed(2);
  }

  const vaultChanged = Object.keys(vaultAfter).filter((c) => vaultBefore[c] !== vaultAfter[c]);

  /* ---- 5. stale alerts and vault "as of" bookkeeping ---- */
  // Alerts point at customers/beneficiaries that may no longer exist, and the
  // first /api/alerts poll recalculates them anyway.
  await tx.alert.deleteMany();

  return {
    sales: d.sales?.length ?? 0,
    purchases: d.purchases?.length ?? 0,
    customers: d.customers?.length ?? 0,
    beneficiaries: d.beneficiaries?.length ?? 0,
    inventoryItems: d.inventoryItems?.length ?? 0,
    vaultTransactions: d.vaultTransactions?.length ?? 0,
    vault: { before: vaultBefore, after: vaultAfter, changed: vaultChanged },
  };
}

export const POST = handler("settings", async (req, user) => {
  if (user.role !== "OWNER") return fail("Owner access required.", 403);

  let payload: any;
  try {
    const body = await req.json();
    const filename = String(body?.filename || "");
    if (filename) {
      payload = JSON.parse(await readBackupFile(filename));
    } else if (body?.data) {
      payload = body.data;
    } else {
      return fail("No backup file provided.", 400, "VALIDATION");
    }
  } catch (e) {
    if (e instanceof AppError) return fail(e.message, e.statusCode, e.code);
    return fail("Backup file could not be parsed.", 400, "BACKUP_INVALID");
  }

  if (payload?.app !== "ALU_FACTORY" || !payload.data) {
    return fail("Invalid backup file format.", 400, "BACKUP_INVALID");
  }

  const source = filename_(payload);

  let restored: RestoreResult;
  try {
    restored = await prisma.$transaction((tx) => replay(tx, payload.data), TX_OPTIONS);
  } catch (e) {
    // The transaction rolled back, so the database is untouched.
    console.error("[restore] failed, no changes applied:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`Restore failed and nothing was changed. ${msg}`, 500, "RESTORE_FAILED");
  }

  // Outside the transaction, so the trail survives even if this write is what
  // the database was upset about.
  await audit(user.id, "RESTORE", "SYSTEM", source, restored);
  return ok({ success: true, restoredFrom: source, counts: restored });
});

function filename_(payload: any) {
  return String(payload?.exportedAt ? new Date(payload.exportedAt).toISOString() : "uploaded file");
}