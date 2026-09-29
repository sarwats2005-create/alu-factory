import { prisma } from "./db";
import { D } from "./money";
import { Prisma } from "@prisma/client";

/** Customer due in a currency: SUM(sale dues) − SUM(payments). Positive → "Customer owes factory". */
export async function customerDue(customerId: string, currency?: string): Promise<Prisma.Decimal> {
  const sales = await prisma.sale.aggregate({
    where: { customerId, ...(currency ? { currency } : {}) },
    _sum: { dueAmount: true },
  });
  const payments = await prisma.customerPayment.aggregate({
    where: { customerId, ...(currency ? { currency } : {}) },
    _sum: { amount: true },
  });
  return D(sales._sum.dueAmount ?? 0).minus(D(payments._sum.amount ?? 0));
}

/** Beneficiary due: SUM(purchase dues) − SUM(payments). Positive → "Factory owes beneficiary". */
export async function beneficiaryDue(beneficiaryId: string, currency?: string): Promise<Prisma.Decimal> {
  const purchases = await prisma.purchase.aggregate({
    where: { beneficiaryId, ...(currency ? { currency } : {}) },
    _sum: { dueAmount: true },
  });
  const payments = await prisma.beneficiaryPayment.aggregate({
    where: { beneficiaryId, ...(currency ? { currency } : {}) },
    _sum: { amount: true },
  });
  return D(purchases._sum.dueAmount ?? 0).minus(D(payments._sum.amount ?? 0));
}

/** Customer lifetime totals for the account page cards. */
export async function customerTotals(customerId: string) {
  const sales = await prisma.sale.aggregate({
    where: { customerId },
    _sum: { totalAmount: true, cashPaid: true, dueAmount: true, cogs: true },
    _count: true,
  });
  const payments = await prisma.customerPayment.aggregate({
    where: { customerId },
    _sum: { amount: true },
    _count: true,
  });
  const totalSales = D(sales._sum.totalAmount ?? 0);
  const totalCash = D(sales._sum.cashPaid ?? 0).plus(D(payments._sum.amount ?? 0));
  return {
    totalSales,
    totalCash,
    totalDue: D(sales._sum.dueAmount ?? 0),
    paymentsCount: payments._count,
    salesCount: sales._count,
    profit: totalSales.minus(D(sales._sum.cogs ?? 0)),
  };
}

/** Beneficiary lifetime totals. */
export async function beneficiaryTotals(beneficiaryId: string) {
  const purchases = await prisma.purchase.aggregate({
    where: { beneficiaryId },
    _sum: { totalPrice: true, cashPaid: true, dueAmount: true, weightKg: true },
    _count: true,
  });
  const payments = await prisma.beneficiaryPayment.aggregate({
    where: { beneficiaryId },
    _sum: { amount: true },
    _count: true,
  });
  const totalPurchases = D(purchases._sum.totalPrice ?? 0);
  return {
    totalPurchases,
    totalPaid: D(purchases._sum.cashPaid ?? 0).plus(D(payments._sum.amount ?? 0)),
    totalDue: D(purchases._sum.dueAmount ?? 0),
    totalWeight: D(purchases._sum.weightKg ?? 0),
    paymentsCount: payments._count,
    purchasesCount: purchases._count,
  };
}
