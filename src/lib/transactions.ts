import { prisma } from "./db";
import { D, parseDateInput } from "./money";
import { AppError } from "./api";
import { Prisma } from "@prisma/client";
import { applyVaultMovement, convertToVault, assertRateNeeded } from "./vault";

type Client = Prisma.TransactionClient;

/**
 * Interactive transaction tuned for a remote database (e.g. Neon): every query
 * pays network round-trip latency, so multi-step transactions routinely exceed
 * Prisma's 5s default and abort with P2028. 30s max wait, 30s to run.
 */
const TX_OPTIONS = { maxWait: 30_000, timeout: 30_000 } as const;

function transact<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn, TX_OPTIONS);
}

// ============ NUMBER GENERATION (transactional) ============

async function nextNumber(tx: Client, kind: "purchase" | "sale"): Promise<string> {
  if (kind === "purchase") {
    const agg = await tx.purchase.aggregate({ _max: { number: true } });
    const last = agg._max.number;
    const seq = last ? parseInt(last.split("-")[1], 10) || 0 : 0;
    return `PUR-${String(seq + 1).padStart(5, "0")}`;
  }
  const agg = await tx.sale.aggregate({ _max: { invoiceNo: true } });
  const last = agg._max.invoiceNo;
  const seq = last ? parseInt(last.split("-")[1], 10) || 0 : 0;
  return `INV-${String(seq + 1).padStart(5, "0")}`;
}

// ============ VALIDATION HELPERS ============

function assertPositive(v: Prisma.Decimal.Value, label: string) {
  if (D(v).lte(0)) throw new AppError(`${label} must be greater than 0.`, 400, "VALIDATION");
}
function assertNonNegative(v: Prisma.Decimal.Value, label: string) {
  if (D(v).lt(0)) throw new AppError(`${label} cannot be negative.`, 400, "VALIDATION");
}

async function rateFor(
  tx: Client,
  txCurrency: string,
  vaultCurrency: string
): Promise<Prisma.Decimal | null> {
  const needed = assertRateNeeded(txCurrency, vaultCurrency, txCurrency !== vaultCurrency ? 1 : null);
  if (!needed) return null;
  const s = await tx.setting.findUnique({ where: { id: "singleton" } });
  const rate = D(s?.exchangeRate ?? 0);
  if (rate.lte(0))
    throw new AppError("Exchange rate must be set in Settings before using cross-currency vaults.", 400);
  return rate;
}

// ============ PURCHASE ============

export interface PurchaseInput {
  beneficiaryId: string;
  productName: string;
  sku: string;
  aluminumType: string;
  weightKg: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  currency: string;
  vaultCurrency: string;
  cashPaid: Prisma.Decimal.Value;
  txDate: string;
  notes?: string;
}

export async function createPurchase(userId: string, input: PurchaseInput) {
  const weightKg = D(input.weightKg);
  const unitPrice = D(input.unitPrice);
  const cashPaid = D(input.cashPaid);
  assertPositive(weightKg, "Weight (kg)");
  assertPositive(unitPrice, "Unit price");
  assertNonNegative(cashPaid, "Cash paid");
  const txDate = parseDateInput(input.txDate);

  return transact(async (tx) => {
    const beneficiary = await tx.beneficiary.findUnique({ where: { id: input.beneficiaryId } });
    if (!beneficiary) throw new AppError("Beneficiary not found.", 404);

    const totalPrice = weightKg.times(unitPrice); // SERVER-CALCULATED
    const dueAmount = totalPrice.minus(cashPaid); // SERVER-CALCULATED
    const exchangeRate = await rateFor(tx, input.currency, input.vaultCurrency);

    // Upsert inventory item
    let item = await tx.inventoryItem.findUnique({ where: { sku: input.sku.trim() } });
    if (item && item.name.toLowerCase() !== input.productName.trim().toLowerCase()) {
      throw new AppError("This SKU already belongs to a different product. Choose a different SKU.", 409, "SKU_CONFLICT");
    }
    if (!item) {
      item = await tx.inventoryItem.create({
        data: {
          sku: input.sku.trim(),
          name: input.productName.trim(),
          aluminumType: input.aluminumType,
          beneficiaryId: beneficiary.id,
        },
      });
    }

    const number = await nextNumber(tx, "purchase");

    const purchase = await tx.purchase.create({
      data: {
        number,
        beneficiaryId: beneficiary.id,
        productName: input.productName.trim(),
        sku: input.sku.trim(),
        aluminumType: input.aluminumType,
        weightKg,
        unitPrice,
        currency: input.currency,
        vaultCurrency: input.vaultCurrency,
        exchangeRate,
        totalPrice,
        cashPaid,
        dueAmount,
        notes: input.notes ?? null,
        txDate,
        itemId: item.id,
      },
    });

    // Inventory IN
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        totalPurchased: { increment: weightKg },
        available: { increment: weightKg },
        beneficiaryId: beneficiary.id,
      },
    });
    await tx.inventoryMovement.create({
      data: {
        itemId: item.id,
        direction: "IN",
        qtyKg: weightKg,
        reference: number,
        note: `Purchase from ${beneficiary.fullName}`,
        movedAt: txDate,
      },
    });

    // Vault deduction of cash paid
    if (cashPaid.gt(0)) {
      const cashInVault = convertToVault(cashPaid, input.currency, input.vaultCurrency, exchangeRate ?? 1);
      await applyVaultMovement(tx, {
        vaultCurrency: input.vaultCurrency,
        amountOut: cashInVault,
        type: "PURCHASE",
        reference: number,
        description: `Purchase ${number} — ${input.productName.trim()} (${weightKg.toFixed(2)} kg) from ${beneficiary.fullName}`,
        txCurrency: input.currency,
        exchangeRate,
        txDate,
        purchaseId: purchase.id,
      });
    }

    return purchase;
  });
}

/** Reverse all effects of a purchase inside a transaction (for edit/delete). */
async function reversePurchase(tx: Client, purchaseId: string) {
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new AppError("Purchase not found.", 404);

  // Reverse inventory
  await tx.inventoryItem.update({
    where: { id: purchase.itemId! },
    data: {
      totalPurchased: { decrement: purchase.weightKg },
      available: { decrement: purchase.weightKg },
    },
  });
  await tx.inventoryMovement.create({
    data: {
      itemId: purchase.itemId!,
      direction: "OUT",
      qtyKg: purchase.weightKg,
      reference: purchase.number,
      note: `Reversal of purchase ${purchase.number}`,
      movedAt: new Date(),
    },
  });

  // Reverse vault cash paid
  if (D(purchase.cashPaid).gt(0)) {
    const cashInVault = convertToVault(purchase.cashPaid, purchase.currency, purchase.vaultCurrency, purchase.exchangeRate ?? 1);
    await applyVaultMovement(tx, {
      vaultCurrency: purchase.vaultCurrency,
      amountIn: cashInVault,
      type: "PURCHASE_REVERSAL",
      reference: purchase.number,
      description: `Reversal of purchase ${purchase.number}`,
      txCurrency: purchase.currency,
      exchangeRate: purchase.exchangeRate,
      txDate: new Date(),
    });
  }
  return purchase;
}

export async function updatePurchase(userId: string, purchaseId: string, input: PurchaseInput) {
  const weightKg = D(input.weightKg);
  const unitPrice = D(input.unitPrice);
  const cashPaid = D(input.cashPaid);
  assertPositive(weightKg, "Weight (kg)");
  assertPositive(unitPrice, "Unit price");
  assertNonNegative(cashPaid, "Cash paid");
  const txDate = parseDateInput(input.txDate);

  return transact(async (tx) => {
    const existing = await reversePurchase(tx, purchaseId);

    const beneficiary = await tx.beneficiary.findUnique({ where: { id: input.beneficiaryId } });
    if (!beneficiary) throw new AppError("Beneficiary not found.", 404);

    const totalPrice = weightKg.times(unitPrice);
    const dueAmount = totalPrice.minus(cashPaid);
    const exchangeRate = await rateFor(tx, input.currency, input.vaultCurrency);

    // Reuse or create inventory item
    let item = await tx.inventoryItem.findUnique({ where: { sku: input.sku.trim() } });
    if (item && item.name.toLowerCase() !== input.productName.trim().toLowerCase()) {
      throw new AppError("This SKU already belongs to a different product. Choose a different SKU.", 409, "SKU_CONFLICT");
    }
    if (!item) {
      item = await tx.inventoryItem.create({
        data: {
          sku: input.sku.trim(),
          name: input.productName.trim(),
          aluminumType: input.aluminumType,
          beneficiaryId: beneficiary.id,
        },
      });
    }

    const updated = await tx.purchase.update({
      where: { id: purchaseId },
      data: {
        beneficiaryId: beneficiary.id,
        productName: input.productName.trim(),
        sku: input.sku.trim(),
        aluminumType: input.aluminumType,
        weightKg,
        unitPrice,
        currency: input.currency,
        vaultCurrency: input.vaultCurrency,
        exchangeRate,
        totalPrice,
        cashPaid,
        dueAmount,
        notes: input.notes ?? null,
        txDate,
        itemId: item.id,
      },
    });

    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        totalPurchased: { increment: weightKg },
        available: { increment: weightKg },
        beneficiaryId: beneficiary.id,
      },
    });
    await tx.inventoryMovement.create({
      data: {
        itemId: item.id,
        direction: "IN",
        qtyKg: weightKg,
        reference: existing.number,
        note: `Updated purchase ${existing.number}`,
        movedAt: txDate,
      },
    });

    if (cashPaid.gt(0)) {
      const cashInVault = convertToVault(cashPaid, input.currency, input.vaultCurrency, exchangeRate ?? 1);
      await applyVaultMovement(tx, {
        vaultCurrency: input.vaultCurrency,
        amountOut: cashInVault,
        type: "PURCHASE",
        reference: existing.number,
        description: `Updated purchase ${existing.number} — ${input.productName.trim()} (${weightKg.toFixed(2)} kg) from ${beneficiary.fullName}`,
        txCurrency: input.currency,
        exchangeRate,
        txDate,
        purchaseId,
      });
    }

    return updated;
  });
}

export async function deletePurchase(userId: string, purchaseId: string) {
  return transact(async (tx) => {
    const existing = await reversePurchase(tx, purchaseId);
    await tx.vaultTransaction.deleteMany({ where: { purchaseId } });
    await tx.purchase.delete({ where: { id: purchaseId } });
    return existing;
  });
}

// ============ SALE ============

export interface SaleLineInput {
  itemId: string;
  saleType?: string;
  weightKg: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
}

export interface SaleInput {
  customerId: string;
  currency: string;
  vaultCurrency: string;
  cashPaid: Prisma.Decimal.Value;
  saleDate: string;
  notes?: string;
  lineItems: SaleLineInput[];
}

export async function createSale(userId: string, input: SaleInput) {
  if (!input.lineItems.length) throw new AppError("At least one line item is required.", 400, "VALIDATION");
  const cashPaid = D(input.cashPaid);
  assertNonNegative(cashPaid, "Cash paid");
  const saleDate = parseDateInput(input.saleDate);

  return transact(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new AppError("Customer not found.", 404);

    // Validate and recalculate all line items server-side
    let totalAmount = D(0);
    let cogs = D(0);
    const lines: { itemId: string; saleType: string; weightKg: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal; costKg: Prisma.Decimal }[] = [];

    for (const li of input.lineItems) {
      const weight = D(li.weightKg);
      const price = D(li.unitPrice);
      assertPositive(weight, "Line weight (kg)");
      assertPositive(price, "Line unit price");

      const item = await tx.inventoryItem.findUnique({ where: { id: li.itemId } });
      if (!item) throw new AppError("Inventory item not found for a sale line.", 404);
      if (weight.gt(D(item.available))) {
        throw new AppError(`Insufficient stock: only ${D(item.available).toFixed(2)} kg available for ${item.name} (${item.sku}).`, 400, "INSUFFICIENT_STOCK");
      }

      const lineTotal = weight.times(price); // SERVER-CALCULATED
      totalAmount = totalAmount.plus(lineTotal);
      // COGS: weighted average buy price per kg across purchases of this SKU.
      // Normalized to USD: purchase totals in IQD are converted at each purchase's own rate.
      const purchases = await tx.purchase.findMany({
        where: { sku: item.sku },
        select: { totalPrice: true, weightKg: true, currency: true, exchangeRate: true },
      });
      let boughtCostUsd = D(0);
      let boughtKg = D(0);
      for (const p of purchases) {
        const cost = p.currency === "IQD" ? D(p.totalPrice).div(D(p.exchangeRate ?? 1)) : D(p.totalPrice);
        boughtCostUsd = boughtCostUsd.plus(cost);
        boughtKg = boughtKg.plus(D(p.weightKg));
      }
      const avgBuyPrice = boughtKg.gt(0) ? boughtCostUsd.div(boughtKg) : D(0); // USD per kg
      cogs = cogs.plus(weight.times(avgBuyPrice)); // USD

      lines.push({ itemId: li.itemId, saleType: li.saleType ?? "RAW", weightKg: weight, unitPrice: price, lineTotal, costKg: avgBuyPrice });
    }

    const dueAmount = totalAmount.minus(cashPaid); // SERVER-CALCULATED
    const exchangeRate = await rateFor(tx, input.currency, input.vaultCurrency);
    const invoiceNo = await nextNumber(tx, "sale");

    const sale = await tx.sale.create({
      data: {
        invoiceNo,
        customerId: customer.id,
        currency: input.currency,
        vaultCurrency: input.vaultCurrency,
        exchangeRate,
        totalAmount,
        cashPaid,
        dueAmount,
        cogs,
        notes: input.notes ?? null,
        saleDate,
        lineItems: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            saleType: l.saleType,
            weightKg: l.weightKg,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });

    // Deduct inventory
    for (const l of lines) {
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: { available: { decrement: l.weightKg } },
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: l.itemId,
          direction: "OUT",
          qtyKg: l.weightKg,
          reference: invoiceNo,
          note: `Sale to ${customer.fullName}`,
          movedAt: saleDate,
        },
      });
    }

    // Vault: cash received
    if (cashPaid.gt(0)) {
      const cashInVault = convertToVault(cashPaid, input.currency, input.vaultCurrency, exchangeRate ?? 1);
      await applyVaultMovement(tx, {
        vaultCurrency: input.vaultCurrency,
        amountIn: cashInVault,
        type: "SALE",
        reference: invoiceNo,
        description: `Sale ${invoiceNo} — ${customer.fullName}`,
        txCurrency: input.currency,
        exchangeRate,
        txDate: saleDate,
        saleId: sale.id,
      });
    }

    return sale;
  });
}

/** Reverse a sale's effects; returns the sale for reapplication. */
async function reverseSale(tx: Client, saleId: string) {
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { lineItems: true },
  });
  if (!sale) throw new AppError("Sale not found.", 404);

  for (const li of sale.lineItems) {
    await tx.inventoryItem.update({
      where: { id: li.itemId },
      data: { available: { increment: li.weightKg } },
    });
    await tx.inventoryMovement.create({
      data: {
        itemId: li.itemId,
        direction: "IN",
        qtyKg: li.weightKg,
        reference: sale.invoiceNo,
        note: `Reversal of sale ${sale.invoiceNo}`,
        movedAt: new Date(),
      },
    });
  }

  if (D(sale.cashPaid).gt(0)) {
    const cashInVault = convertToVault(sale.cashPaid, sale.currency, sale.vaultCurrency, sale.exchangeRate ?? 1);
    await applyVaultMovement(tx, {
      vaultCurrency: sale.vaultCurrency,
      amountOut: cashInVault,
      type: "SALE_REVERSAL",
      reference: sale.invoiceNo,
      description: `Reversal of sale ${sale.invoiceNo}`,
      txCurrency: sale.currency,
      exchangeRate: sale.exchangeRate,
      txDate: new Date(),
    });
  }
  return sale;
}

export async function updateSale(userId: string, saleId: string, input: SaleInput) {
  if (!input.lineItems.length) throw new AppError("At least one line item is required.", 400, "VALIDATION");
  const cashPaid = D(input.cashPaid);
  assertNonNegative(cashPaid, "Cash paid");
  const saleDate = parseDateInput(input.saleDate);

  return transact(async (tx) => {
    const existing = await reverseSale(tx, saleId);

    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new AppError("Customer not found.", 404);

    let totalAmount = D(0);
    let cogs = D(0);
    const lines: { itemId: string; saleType: string; weightKg: Prisma.Decimal; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[] = [];

    for (const li of input.lineItems) {
      const weight = D(li.weightKg);
      const price = D(li.unitPrice);
      assertPositive(weight, "Line weight (kg)");
      assertPositive(price, "Line unit price");

      const item = await tx.inventoryItem.findUnique({ where: { id: li.itemId } });
      if (!item) throw new AppError("Inventory item not found for a sale line.", 404);
      // Available check: reversed sale has restored stock, so compare against restored
      const availableAfterReverse = D(item.available).plus(existing.lineItems.filter((x) => x.itemId === li.itemId).reduce((a, x) => a.plus(D(x.weightKg)), D(0)));
      if (weight.gt(availableAfterReverse)) {
        throw new AppError(`Insufficient stock: only ${availableAfterReverse.toFixed(2)} kg available for ${item.name} (${item.sku}).`, 400, "INSUFFICIENT_STOCK");
      }

      const lineTotal = weight.times(price);
      totalAmount = totalAmount.plus(lineTotal);
      // Same USD-normalized COGS calculation as createSale
      const purchases = await tx.purchase.findMany({
        where: { sku: item.sku },
        select: { totalPrice: true, weightKg: true, currency: true, exchangeRate: true },
      });
      let boughtCostUsd = D(0);
      let boughtKg = D(0);
      for (const p of purchases) {
        const cost = p.currency === "IQD" ? D(p.totalPrice).div(D(p.exchangeRate ?? 1)) : D(p.totalPrice);
        boughtCostUsd = boughtCostUsd.plus(cost);
        boughtKg = boughtKg.plus(D(p.weightKg));
      }
      const avgBuyPrice = boughtKg.gt(0) ? boughtCostUsd.div(boughtKg) : D(0);
      cogs = cogs.plus(weight.times(avgBuyPrice));

      lines.push({ itemId: li.itemId, saleType: li.saleType ?? "RAW", weightKg: weight, unitPrice: price, lineTotal });
    }

    const dueAmount = totalAmount.minus(cashPaid);
    const exchangeRate = await rateFor(tx, input.currency, input.vaultCurrency);

    await tx.saleLineItem.deleteMany({ where: { saleId } });
    const updated = await tx.sale.update({
      where: { id: saleId },
      data: {
        customerId: customer.id,
        currency: input.currency,
        vaultCurrency: input.vaultCurrency,
        exchangeRate,
        totalAmount,
        cashPaid,
        dueAmount,
        cogs,
        notes: input.notes ?? null,
        saleDate,
        lineItems: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            saleType: l.saleType,
            weightKg: l.weightKg,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });

    for (const l of lines) {
      await tx.inventoryItem.update({
        where: { id: l.itemId },
        data: { available: { decrement: l.weightKg } },
      });
      await tx.inventoryMovement.create({
        data: {
          itemId: l.itemId,
          direction: "OUT",
          qtyKg: l.weightKg,
          reference: existing.invoiceNo,
          note: `Updated sale ${existing.invoiceNo}`,
          movedAt: saleDate,
        },
      });
    }

    if (cashPaid.gt(0)) {
      const cashInVault = convertToVault(cashPaid, input.currency, input.vaultCurrency, exchangeRate ?? 1);
      await applyVaultMovement(tx, {
        vaultCurrency: input.vaultCurrency,
        amountIn: cashInVault,
        type: "SALE",
        reference: existing.invoiceNo,
        description: `Updated sale ${existing.invoiceNo} — ${customer.fullName}`,
        txCurrency: input.currency,
        exchangeRate,
        txDate: saleDate,
        saleId,
      });
    }

    return updated;
  });
}

export async function deleteSale(userId: string, saleId: string) {
  return transact(async (tx) => {
    const existing = await reverseSale(tx, saleId);
    await tx.saleLineItem.deleteMany({ where: { saleId } });
    await tx.vaultTransaction.deleteMany({ where: { saleId } });
    await tx.sale.delete({ where: { id: saleId } });
    return existing;
  });
}

// ============ LOSS PROCESSING ============

export interface LossInput {
  itemId: string;
  mode: "PERCENT" | "MANUAL";
  lossPct?: Prisma.Decimal.Value;
  remainingKg?: Prisma.Decimal.Value;
  notes?: string;
  processedAt: string;
}

export async function applyLoss(userId: string, input: LossInput) {
  return transact(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new AppError("Inventory item not found.", 404);
    const original = D(item.available);
    if (original.lte(0)) throw new AppError("No available weight to process.", 400);

    let remaining: Prisma.Decimal;
    let lossPct: Prisma.Decimal;
    if (input.mode === "PERCENT") {
      const pct = D(input.lossPct ?? 0);
      if (pct.lte(0) || pct.gte(100)) throw new AppError("Loss percentage must be between 0 and 100.", 400, "VALIDATION");
      remaining = original.times(D(1).minus(pct.div(100)));
      lossPct = pct;
    } else {
      remaining = D(input.remainingKg ?? 0);
      if (remaining.lt(0) || remaining.gte(original))
        throw new AppError(`Remaining weight must be between 0 and ${original.toFixed(2)} kg.`, 400, "VALIDATION");
      lossPct = original.minus(remaining).div(original).times(100);
    }

    const lossKg = original.minus(remaining);
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        available: remaining,
        totalProcessed: { increment: lossKg },
      },
    });
    const ev = await tx.lossEvent.create({
      data: {
        itemId: item.id,
        originalKg: original,
        lossKg,
        lossPct,
        remainingKg: remaining,
        notes: input.notes ?? null,
        processedAt: parseDateInput(input.processedAt),
      },
    });
    await tx.inventoryMovement.create({
      data: {
        itemId: item.id,
        direction: "LOSS",
        qtyKg: lossKg,
        reference: `LOSS-${ev.id.slice(-6).toUpperCase()}`,
        note: `Loss ${lossPct.toFixed(2)}% — ${input.mode === "PERCENT" ? "by percentage" : "manual"}`,
        movedAt: parseDateInput(input.processedAt),
      },
    });
    return ev;
  });
}

// ============ VAULT DIRECT OPERATIONS ============

export interface VaultOpInput {
  vaultCurrency: string;
  opType: "DEPOSIT" | "WITHDRAW";
  amount: Prisma.Decimal.Value;
  label: string;
  notes?: string;
  opDate: string;
}

export async function createVaultOp(userId: string, input: VaultOpInput) {
  const amount = D(input.amount);
  assertPositive(amount, "Amount");
  const opDate = parseDateInput(input.opDate);

  return transact(async (tx) => {
    const op = await tx.vaultOperation.create({
      data: {
        vaultCurrency: input.vaultCurrency,
        opType: input.opType,
        amount,
        label: input.label.trim(),
        notes: input.notes ?? null,
        opDate,
      },
    });
    await applyVaultMovement(tx, {
      vaultCurrency: input.vaultCurrency,
      amountIn: input.opType === "DEPOSIT" ? amount : undefined,
      amountOut: input.opType === "WITHDRAW" ? amount : undefined,
      type: input.opType,
      reference: op.id.slice(-6).toUpperCase(),
      description: `${input.opType === "DEPOSIT" ? "Deposit" : "Withdrawal"} — ${input.label.trim()}`,
      txCurrency: input.vaultCurrency,
      txDate: opDate,
      vaultOpId: op.id,
    });
    return op;
  });
}

export async function deleteVaultOp(userId: string, opId: string) {
  return transact(async (tx) => {
    const op = await tx.vaultOperation.findUnique({ where: { id: opId } });
    if (!op) throw new AppError("Vault operation not found.", 404);
    await applyVaultMovement(tx, {
      vaultCurrency: op.vaultCurrency,
      amountIn: op.opType === "WITHDRAW" ? op.amount : undefined,
      amountOut: op.opType === "DEPOSIT" ? op.amount : undefined,
      type: `${op.opType}_REVERSAL`,
      reference: op.id.slice(-6).toUpperCase(),
      description: `Reversal of ${op.opType.toLowerCase()} — ${op.label}`,
      txCurrency: op.vaultCurrency,
      txDate: new Date(),
    });
    await tx.vaultTransaction.deleteMany({ where: { vaultOpId: opId } });
    await tx.vaultOperation.delete({ where: { id: opId } });
    return op;
  });
}

// ============ PAYMENTS AGAINST DUES ============

export interface PaymentInput {
  amount: Prisma.Decimal.Value;
  currency: string;
  vaultCurrency: string;
  notes?: string;
  payDate: string;
}

export async function createCustomerPayment(userId: string, customerId: string, input: PaymentInput) {
  const amount = D(input.amount);
  assertPositive(amount, "Amount");
  const payDate = parseDateInput(input.payDate);

  return transact(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new AppError("Customer not found.", 404);
    const exchangeRate = await rateFor(tx, input.currency, input.vaultCurrency);
    const count = await tx.customerPayment.count({ where: { customerId } });
    const reference = `PAY-C-${String(count + 1).padStart(5, "0")}`;

    const payment = await tx.customerPayment.create({
      data: {
        customerId,
        amount,
        currency: input.currency,
        vaultCurrency: input.vaultCurrency,
        exchangeRate,
        reference,
        notes: input.notes ?? null,
        payDate,
      },
    });
    const inVault = convertToVault(amount, input.currency, input.vaultCurrency, exchangeRate ?? 1);
    await applyVaultMovement(tx, {
      vaultCurrency: input.vaultCurrency,
      amountIn: inVault,
      type: "CUSTOMER_PAYMENT",
      reference,
      description: `Payment from ${customer.fullName} — ${input.notes || "due settlement"}`,
      txCurrency: input.currency,
      exchangeRate,
      txDate: payDate,
      customerPaymentId: payment.id,
    });
    return payment;
  });
}

export async function createBeneficiaryPayment(userId: string, beneficiaryId: string, input: PaymentInput) {
  const amount = D(input.amount);
  assertPositive(amount, "Amount");
  const payDate = parseDateInput(input.payDate);

  return transact(async (tx) => {
    const beneficiary = await tx.beneficiary.findUnique({ where: { id: beneficiaryId } });
    if (!beneficiary) throw new AppError("Beneficiary not found.", 404);
    const exchangeRate = await rateFor(tx, input.currency, input.vaultCurrency);
    const count = await tx.beneficiaryPayment.count({ where: { beneficiaryId } });
    const reference = `PAY-B-${String(count + 1).padStart(5, "0")}`;

    const payment = await tx.beneficiaryPayment.create({
      data: {
        beneficiaryId,
        amount,
        currency: input.currency,
        vaultCurrency: input.vaultCurrency,
        exchangeRate,
        reference,
        notes: input.notes ?? null,
        payDate,
      },
    });
    const inVault = convertToVault(amount, input.currency, input.vaultCurrency, exchangeRate ?? 1);
    await applyVaultMovement(tx, {
      vaultCurrency: input.vaultCurrency,
      amountOut: inVault,
      type: "BENEFICIARY_PAYMENT",
      reference,
      description: `Payment to ${beneficiary.fullName} — ${input.notes || "due settlement"}`,
      txCurrency: input.currency,
      exchangeRate,
      txDate: payDate,
      beneficiaryPaymentId: payment.id,
    });
    return payment;
  });
}
