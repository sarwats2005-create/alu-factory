import { prisma } from "./db";
import { D } from "./money";
import { avgBuyPriceUsd } from "./transactions";
import { customerBalance, beneficiaryBalance } from "./balances";
import { Prisma } from "@prisma/client";

/**
 * Processing loss valued at cost, in USD.
 *
 * Aluminum lost to cutting/melting was paid for, so it is a real expense:
 * lossKg × the SKU's weighted-average purchase price. It is recognised when
 * the loss is recorded, so profit never looks better than it is while the
 * lost metal quietly disappears from stock.
 */
export async function processingLossUsd(
  rate: Prisma.Decimal,
  range?: { gte?: Date; lte?: Date }
): Promise<{ total: Prisma.Decimal; kg: Prisma.Decimal; events: { processedAt: Date; valueUsd: Prisma.Decimal }[] }> {
  const events = await prisma.lossEvent.findMany({
    where: range ? { processedAt: range } : {},
    select: { lossKg: true, processedAt: true, item: { select: { sku: true } } },
  });
  const priceCache = new Map<string, Prisma.Decimal>();
  let total = D(0);
  let kg = D(0);
  const out: { processedAt: Date; valueUsd: Prisma.Decimal }[] = [];
  for (const e of events) {
    let price = priceCache.get(e.item.sku);
    if (!price) {
      price = await avgBuyPriceUsd(prisma, e.item.sku, rate);
      priceCache.set(e.item.sku, price);
    }
    const value = D(e.lossKg).times(price);
    total = total.plus(value);
    kg = kg.plus(D(e.lossKg));
    out.push({ processedAt: e.processedAt, valueUsd: value });
  }
  return { total, kg, events: out };
}

/**
 * Receivables and payables, USD equivalent.
 * Only positive balances count: a customer who paid in advance is not a
 * receivable (it is money we hold for them), and vice versa.
 */
export async function receivablesAndPayables(rate: Prisma.Decimal) {
  const [customers, beneficiaries] = await Promise.all([
    prisma.customer.findMany({ select: { id: true } }),
    prisma.beneficiary.findMany({ select: { id: true } }),
  ]);
  let receivable = D(0);
  let customerCredit = D(0);
  for (const c of customers) {
    const b = await customerBalance(c.id, rate);
    if (b.usdEquivalent.gt(0)) receivable = receivable.plus(b.usdEquivalent);
    else customerCredit = customerCredit.plus(b.usdEquivalent.abs());
  }
  let payable = D(0);
  for (const bn of beneficiaries) {
    const b = await beneficiaryBalance(bn.id, rate);
    if (b.usdEquivalent.gt(0)) payable = payable.plus(b.usdEquivalent);
  }
  return { receivable, customerCredit, payable };
}
