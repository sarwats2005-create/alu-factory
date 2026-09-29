import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Everything scoped by name to ONLY touch "Test" records.
  const testCustomers = await prisma.customer.findMany({ where: { fullName: { startsWith: "Test Buyer" } } });
  let testBeneficiaries = await prisma.beneficiary.findMany({ where: { fullName: { startsWith: "Test Supplier" } } });
  let testItems = await prisma.inventoryItem.findMany({ where: { sku: { startsWith: "ALU-" }, name: "Aluminum 6063 Billets" } });

  // Keep any test item that is referenced by a kept sale line (its supplier + purchase stay too)
  const referencedItemIds = new Set((await prisma.saleLineItem.findMany({ where: { itemId: { in: testItems.map((i) => i.id) } }, select: { itemId: true } })).map((s) => s.itemId));
  const keptItems = testItems.filter((i) => referencedItemIds.has(i.id));
  testItems = testItems.filter((i) => !referencedItemIds.has(i.id));

  // Keep the suppliers whose purchase created a kept item (purchase has itemId link)
  const keptPurchases = await prisma.purchase.findMany({ where: { itemId: { in: keptItems.map((i) => i.id) } }, select: { beneficiaryId: true, id: true } });
  const keptBeneficiaryIds = new Set(keptPurchases.map((p) => p.beneficiaryId));
  const keptBeneficiaries = testBeneficiaries.filter((b) => keptBeneficiaryIds.has(b.id));
  testBeneficiaries = testBeneficiaries.filter((b) => !keptBeneficiaryIds.has(b.id));

  const customerIds = testCustomers.map((c) => c.id);
  const beneficiaryIds = testBeneficiaries.map((b) => b.id);
  const itemIds = testItems.map((i) => i.id);

  console.log(`Deleting: ${customerIds.length} test customers, ${beneficiaryIds.length} test beneficiaries, ${itemIds.length} test items`);
  console.log(`Keeping: ${keptItems.length} sold test items (${keptItems.map((i) => i.sku).join(", ")}) with suppliers ${keptBeneficiaries.map((b) => b.fullName).join(", ")}`);

  const result = await prisma.$transaction(
    async (tx) => {
      // Purchases of test suppliers EXCEPT ones backing kept items
      const deletablePurchases = await tx.purchase.findMany({ where: { beneficiaryId: { in: beneficiaryIds } }, select: { id: true, totalPrice: true } });

      await tx.vaultTransaction.deleteMany({ where: { purchaseId: { in: deletablePurchases.map((p) => p.id) } } });
      await tx.purchase.deleteMany({ where: { id: { in: deletablePurchases.map((p) => p.id) } } });
      await tx.lossEvent.deleteMany({ where: { itemId: { in: itemIds } } });
      await tx.inventoryMovement.deleteMany({ where: { itemId: { in: itemIds } } });
      await tx.inventoryItem.deleteMany({ where: { id: { in: itemIds } } });
      await tx.customer.deleteMany({ where: { id: { in: customerIds } } });
      await tx.beneficiaryPayment.deleteMany({ where: { beneficiaryId: { in: beneficiaryIds } } });
      await tx.beneficiary.deleteMany({ where: { id: { in: beneficiaryIds } } });

      // Rebalance USD vault by the total of the deleted purchases
      const vault = await tx.vault.findUnique({ where: { currency: "USD" } });
      if (!vault) throw new Error("USD vault not found");
      const subtracted = deletablePurchases.reduce((acc, p) => acc.add(p.totalPrice), vault.balance.sub(vault.balance)); // Decimal 0 start
      const newBalance = vault.balance.sub(subtracted);
      await tx.vault.update({ where: { currency: "USD" }, data: { balance: newBalance } });

      return { purchases: deletablePurchases.length, subtractedFromVault: subtracted.toString(), newUsdBalance: newBalance.toString() };
    },
    { maxWait: 30_000, timeout: 30_000 }
  );

  console.log("Done:", result);

  const remainingCustomers = await prisma.customer.findMany({ select: { fullName: true } });
  const remainingBeneficiaries = await prisma.beneficiary.findMany({ select: { fullName: true } });
  const remainingItems = await prisma.inventoryItem.findMany({ select: { sku: true, available: true } });
  const vaults = await prisma.vault.findMany();
  console.log(`\nCustomers now: ${remainingCustomers.map((c) => c.fullName).join(", ")}`);
  console.log(`Beneficiaries now: ${remainingBeneficiaries.map((b) => b.fullName).join(", ")}`);
  console.log(`Inventory now: ${remainingItems.map((i) => `${i.sku}(${i.available}kg)`).join(", ")}`);
  for (const v of vaults) console.log(`Vault ${v.currency}: ${v.balance}`);
}

main().finally(() => prisma.$disconnect());
