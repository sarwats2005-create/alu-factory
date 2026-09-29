import { prisma } from "./db";
import { D } from "./money";
import { AppError } from "./api";
import { Prisma } from "@prisma/client";

export type VaultSnapshot = { USD: import("@prisma/client").Vault; IQD: import("@prisma/client").Vault };
type Client = Prisma.TransactionClient | typeof prisma;

export async function getVaults(tx: Client = prisma): Promise<VaultSnapshot> {
  const rows = await tx.vault.findMany();
  const usd = rows.find((v) => v.currency === "USD");
  const iqd = rows.find((v) => v.currency === "IQD");
  if (!usd || !iqd) throw new AppError("Vaults are not initialized.", 500, "VAULTS_MISSING");
  return { USD: usd, IQD: iqd } as VaultSnapshot;
}

export function vaultFor(currency: string, vaults: VaultSnapshot) {
  const v = currency === "IQD" ? vaults.IQD : vaults.USD;
  if (v.currency !== currency) throw new AppError("Vault currency mismatch.", 500);
  return v;
}

interface MovementInput {
  vaultCurrency: string;
  /** Amount credited to the vault, in the vault's own currency. */
  amountIn?: Prisma.Decimal.Value;
  /** Amount debited from the vault, in the vault's own currency. */
  amountOut?: Prisma.Decimal.Value;
  type: string;
  reference?: string | null;
  description: string;
  /** The currency the underlying transaction was conducted in (for the log). */
  txCurrency?: string;
  exchangeRate?: Prisma.Decimal.Value | null;
  txDate?: Date;
  saleId?: string | null;
  purchaseId?: string | null;
  vaultOpId?: string | null;
  customerPaymentId?: string | null;
  beneficiaryPaymentId?: string | null;
}

/**
 * Apply a movement to a vault inside the current transaction and return the
 * created VaultTransaction row. Balance is updated atomically via updateMany
 * with an aggregate read in the same interactive transaction.
 */
export async function applyVaultMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  const vaults = await getVaults(tx);
  const vault = vaultFor(input.vaultCurrency, vaults);

  const amountIn = D(input.amountIn ?? 0);
  const amountOut = D(input.amountOut ?? 0);
  const delta = amountIn.minus(amountOut);
  const newBalance = D(vault.balance).plus(delta);

  await tx.vault.update({ where: { id: vault.id }, data: { balance: newBalance } });

  const vt = await tx.vaultTransaction.create({
    data: {
      vaultCurrency: vault.currency,
      type: input.type,
      reference: input.reference ?? null,
      description: input.description,
      currency: input.txCurrency ?? vault.currency,
      amountIn,
      amountOut,
      balanceAfter: newBalance,
      exchangeRate: input.exchangeRate != null ? D(input.exchangeRate) : null,
      txDate: input.txDate ?? new Date(),
      saleId: input.saleId ?? null,
      purchaseId: input.purchaseId ?? null,
      vaultOpId: input.vaultOpId ?? null,
      customerPaymentId: input.customerPaymentId ?? null,
      beneficiaryPaymentId: input.beneficiaryPaymentId ?? null,
    },
  });
  return vt;
}

/** Convert an amount from a transaction currency to the vault currency. */
export function convertToVault(
  amount: Prisma.Decimal.Value,
  txCurrency: string,
  vaultCurrency: string,
  exchangeRate: Prisma.Decimal.Value
): Prisma.Decimal {
  const a = D(amount);
  if (txCurrency === vaultCurrency) return a;
  // IQD amount into USD vault: divide by rate. USD amount into IQD vault: multiply.
  if (txCurrency === "IQD" && vaultCurrency === "USD") return a.div(D(exchangeRate));
  if (vaultCurrency === "IQD") return a.times(D(exchangeRate));
  return a;
}

export function assertRateNeeded(txCurrency: string, vaultCurrency: string, rate?: Prisma.Decimal.Value | null) {
  if (txCurrency !== vaultCurrency) {
    const r = D(rate ?? 0);
    if (r.lte(0)) throw new AppError("Exchange rate is required when vault currency differs from transaction currency.", 400, "RATE_REQUIRED");
    return r;
  }
  return null;
}
