import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    include: { _count: { select: { sales: true, payments: true } } },
  });
  console.log("=== CUSTOMERS ===");
  for (const c of customers)
    console.log(`${c.fullName} | sales:${c._count.sales} payments:${c._count.payments} | created:${c.createdAt.toISOString()}`);

  const beneficiaries = await prisma.beneficiary.findMany({
    include: { _count: { select: { purchases: true, payments: true } } },
  });
  console.log("\n=== BENEFICIARIES ===");
  for (const b of beneficiaries)
    console.log(`${b.fullName} | purchases:${b._count.purchases} payments:${b._count.payments} | created:${b.createdAt.toISOString()}`);

  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: "asc" },
    include: { customer: { select: { fullName: true } } },
  });
  console.log("\n=== SALES ===");
  for (const s of sales)
    console.log(`${s.invoiceNo} | ${s.customer.fullName} | total:${s.totalAmount} ${s.currency} | date:${s.saleDate.toISOString()}`);

  const purchases = await prisma.purchase.findMany({
    orderBy: { createdAt: "asc" },
    include: { beneficiary: { select: { fullName: true } } },
  });
  console.log("\n=== PURCHASES ===");
  for (const p of purchases)
    console.log(`${p.number} | ${p.beneficiary.fullName} | ${p.productName} ${p.weightKg}kg | total:${p.totalPrice} ${p.currency} | date:${p.txDate.toISOString()}`);

  const items = await prisma.inventoryItem.findMany();
  console.log("\n=== INVENTORY ITEMS ===");
  for (const i of items)
    console.log(`${i.sku} | ${i.name} | purchased:${i.totalPurchased} available:${i.available} | created:${i.createdAt.toISOString()}`);

  const vaults = await prisma.vault.findMany();
  console.log("\n=== VAULTS ===");
  for (const v of vaults) console.log(`${v.currency}: ${v.balance}`);

  const custPays = await prisma.customerPayment.count();
  const benPays = await prisma.beneficiaryPayment.count();
  const losses = await prisma.lossEvent.count();
  const moves = await prisma.inventoryMovement.count();
  console.log(`\ncustomerPayments:${custPays} beneficiaryPayments:${benPays} lossEvents:${losses} movements:${moves}`);
}

main().finally(() => prisma.$disconnect());
