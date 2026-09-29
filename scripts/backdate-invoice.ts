// Backdate an invoice's createdAt to test the 24-hour edit window guard.
// Usage: npx tsx scripts/backdate-invoice.ts <invoiceNo> [hoursAgo]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const invoiceNo = process.argv[2];
  const hoursAgo = Number(process.argv[3] ?? "25");
  if (!invoiceNo) {
    console.error("Usage: npx tsx scripts/backdate-invoice.ts <invoiceNo> [hoursAgo]");
    process.exit(1);
  }
  const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const sale = await prisma.sale.update({
    where: { invoiceNo },
    data: { createdAt },
  });
  console.log(`Backdated ${sale.invoiceNo} createdAt -> ${createdAt.toISOString()} (${hoursAgo}h ago)`);
}

main().finally(() => prisma.$disconnect());
