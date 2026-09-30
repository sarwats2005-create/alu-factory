/**
 * Backup table order.
 * --------------------------------------------------------------------------
 * Restore has to wipe and reinsert every business table, and the order is
 * load-bearing: a child can never be written before its parent, and a parent
 * can never be deleted while a child still references it.
 *
 * Restore deletes in the exact reverse of the insert order, which satisfies
 * both constraints with one list.
 * ========================================================================== */

/**
 * The key a table occupies in the backup JSON, mapped to the Prisma model
 * accessor for it. The two differ — the file is plural and human-readable
 * ("customers"), the client is the singular model name ("customer").
 */
export const BACKUP_TABLES = [
  { key: "aluminumTypes", model: "aluminumType" },
  { key: "customers", model: "customer" },
  { key: "beneficiaries", model: "beneficiary" },
  { key: "inventoryItems", model: "inventoryItem" },
  { key: "lossEvents", model: "lossEvent" },
  { key: "inventoryMovements", model: "inventoryMovement" },
  { key: "purchases", model: "purchase" },
  { key: "sales", model: "sale" },
  { key: "customerPayments", model: "customerPayment" },
  { key: "beneficiaryPayments", model: "beneficiaryPayment" },
  { key: "vaultOperations", model: "vaultOperation" },
  { key: "vaultTransactions", model: "vaultTransaction" },
] as const;

/** Insert order: every parent appears before its children. */
export const RESTORE_ORDER = [...BACKUP_TABLES];

/** Delete order: the exact reverse, so no foreign key is ever violated. */
export const WIPE_ORDER = [...BACKUP_TABLES].reverse();

/**
 * Decimal columns. JSON gives us strings, and re-parsing them through Prisma
 * without this step would lose precision on money, so they are normalised to
 * Decimal objects on the way back in.
 */
export const MONEY_COLUMNS = [
  "amount", "unitPrice", "totalPrice", "totalAmount", "cashPaid", "dueAmount",
  "balance", "balanceAfter", "amountIn", "amountOut", "exchangeRate",
  "weightKg", "lowStockKg", "totalPurchased", "totalProcessed", "available",
  "originalKg", "lossKg", "lossPct", "remainingKg", "qtyKg", "cogs", "lineTotal",
];

/**
 * Fields Prisma derives rather than accepts on a nested create. A line item is
 * written as `sale.create({ lineItems: { create: [...] } })`, and the parent's
 * foreign key is assigned by the nesting — passing it through is rejected.
 */
export const NESTED_DROP = ["saleId"];

/** Postgres caps a statement at 65535 bound parameters; stay well clear. */
export const INSERT_CHUNK = 2000;

/**
 * Every vault balance must equal (sum of amountIn − sum of amountOut) over the
 * transactions recorded against that vault.
 *
 * `applyVaultMovement` updates the balance as it writes each movement, so the
 * two stay in step in normal operation. A mismatch therefore means something
 * set a balance behind the ledger's back — a manual edit, a partial import, or
 * a migration that inserted rows without replaying the balance.
 *
 * Worth checking *before* a restore, because a restore recalculates balances
 * from the ledger and will silently correct the drift.
 */
export function vaultIntegrity(txs: any[], vaults: any[]) {
  const ledger: Record<string, { in: number; out: number; n: number }> = {};
  for (const t of txs) {
    const c = t.vaultCurrency;
    ledger[c] = ledger[c] ?? { in: 0, out: 0, n: 0 };
    ledger[c].in += Number(t.amountIn ?? 0);
    ledger[c].out += Number(t.amountOut ?? 0);
    ledger[c].n += 1;
  }
  return vaults.map((v) => {
    const expected = (ledger[v.currency]?.in ?? 0) - (ledger[v.currency]?.out ?? 0);
    const actual = Number(v.balance);
    return {
      currency: v.currency,
      balance: actual,
      fromLedger: Math.round(expected * 100) / 100,
      transactions: ledger[v.currency]?.n ?? 0,
      ok: Math.abs(expected - actual) < 0.01,
    };
  });
}