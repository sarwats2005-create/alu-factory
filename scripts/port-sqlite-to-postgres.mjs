/**
 * ALU FACTORY — one-off data port: SQLite (prisma/dev.db) → PostgreSQL (Neon).
 *
 * The datasource moved from SQLite to Neon Postgres. This copies every row of
 * every table, converting the two representations that differ:
 *
 *   DateTime  SQLite stores epoch milliseconds (number) → JS Date
 *   Boolean   SQLite stores 0/1 (number)               → boolean
 *   Decimal   SQLite stores REAL/INTEGER (number)      → string (exact)
 *
 * Column types are read from the *target* Postgres schema (information_schema)
 * rather than hardcoded, so the script follows the database, not assumptions.
 *
 * Usage:  node scripts/port-sqlite-to-postgres.mjs
 * Idempotent: createMany({ skipDuplicates: true }) means a re-run only fills gaps.
 */
import { DatabaseSync } from "node:sqlite";
import prismaPkg from "@prisma/client";

const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();

const SQLITE_FILE = "prisma/dev.db";

// Parents before children — Postgres enforces the foreign keys.
const MODELS = [
  "User",
  "Setting",
  "AluminumType",
  "Vault",
  "Customer",
  "Beneficiary",
  "InventoryItem",
  "VaultOperation",
  "Purchase",
  "Sale",
  "CustomerPayment",
  "BeneficiaryPayment",
  "LossEvent",
  "InventoryMovement",
  "SaleLineItem",
  "VaultTransaction",
  "ExchangeRateLog",
  "UserPermission",
  "Alert",
  "AuditLog",
  "Backup",
];

function convert(value, pgType) {
  if (value === null || value === undefined) return null;
  switch (pgType) {
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "date":
      return new Date(Number(value));
    case "boolean":
      return Boolean(value);
    case "numeric":
    case "decimal":
    case "double precision":
    case "real":
      return String(value);
    case "integer":
    case "smallint":
    case "bigint":
      return Number(value);
    case "json":
    case "jsonb":
      try {
        return typeof value === "string" ? JSON.parse(value) : value;
      } catch {
        return null;
      }
    default:
      return value;
  }
}

const delegateName = (model) => model[0].toLowerCase() + model.slice(1);

async function main() {
  // 1. Target column types, straight from Postgres.
  const cols = await prisma.$queryRawUnsafe(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public'`
  );
  const types = new Map(); // table -> column -> pg type
  for (const c of cols) {
    if (!types.has(c.table_name)) types.set(c.table_name, new Map());
    types.get(c.table_name).set(c.column_name, c.data_type);
  }
  if (types.size === 0) {
    throw new Error("No tables found on the target — run `prisma migrate deploy` first.");
  }

  const db = new DatabaseSync(SQLITE_FILE, { readOnly: true });
  const sqliteTables = new Set(
    db
      .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
      .all()
      .map((r) => r.name)
  );

  let total = 0;
  for (const model of MODELS) {
    const table = model;
    if (!sqliteTables.has(table)) {
      console.log(`  --  ${table.padEnd(20)} missing in SQLite, skipped`);
      continue;
    }
    const rows = db.prepare(`select * from "${table}"`).all();
    const delegate = prisma[delegateName(model)];
    if (typeof delegate?.createMany !== "function") {
      throw new Error(`No Prisma delegate for model ${model}`);
    }
    if (rows.length === 0) {
      console.log(`   0  ${table.padEnd(20)} (empty)`);
      continue;
    }

    const colTypes = types.get(table) ?? new Map();
    const data = rows.map((row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        const pgType = colTypes.get(k);
        if (!pgType) continue; // column the Prisma model does not have
        out[k] = convert(v, pgType);
      }
      return out;
    });

    const res = await delegate.createMany({ data, skipDuplicates: true });
    total += res.count;
    console.log(
      `${String(res.count).padStart(4)}  ${table.padEnd(20)} of ${rows.length} row(s) in SQLite`
    );
  }

  console.log(`\nInserted ${total} row(s) into Neon Postgres.`);
  db.close();
}

main()
  .catch((e) => {
    console.error("Port failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
