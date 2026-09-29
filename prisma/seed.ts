import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", exchangeRate: new Prisma.Decimal(1500) },
  });

  await prisma.vault.upsert({
    where: { currency: "USD" },
    update: {},
    create: { currency: "USD", balance: new Prisma.Decimal(0) },
  });
  await prisma.vault.upsert({
    where: { currency: "IQD" },
    update: {},
    create: { currency: "IQD", balance: new Prisma.Decimal(0) },
  });

  for (const t of ["6061", "6063", "Mixed", "Scrap", "Extrusion"]) {
    await prisma.aluminumType.upsert({ where: { name: t }, update: {}, create: { name: t } });
  }

  // Owner account
  await prisma.user.upsert({
    where: { email: "blbas11@gmail.com" },
    update: {},
    create: {
      email: "blbas11@gmail.com",
      passwordHash: await bcrypt.hash("blbas123", 12),
      fullName: "Factory Owner",
      role: "OWNER",
    },
  });

  console.log("Seed complete: settings, vaults, aluminum types, owner account.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
