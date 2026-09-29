import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const oldOwner = await prisma.user.findUnique({ where: { email: "owner@alufactory.com" } });
  let user = await prisma.user.findUnique({ where: { email: "blbas11@gmail.com" } });

  if (user) {
    console.log("blbas11@gmail.com already exists — updating password");
    user = await prisma.user.update({
      where: { email: "blbas11@gmail.com" },
      data: { passwordHash: await bcrypt.hash("blbas123", 12) },
    });
  } else if (oldOwner) {
    console.log("Renaming existing owner account");
    user = await prisma.user.update({
      where: { id: oldOwner.id },
      data: { email: "blbas11@gmail.com", passwordHash: await bcrypt.hash("blbas123", 12) },
    });
  } else {
    console.log("Creating fresh owner");
    user = await prisma.user.create({
      data: {
        email: "blbas11@gmail.com",
        passwordHash: await bcrypt.hash("blbas123", 12),
        fullName: "Factory Owner",
        role: "OWNER",
      },
    });
  }

  console.log("OK:", user.email, "| role:", user.role, "| active:", user.active);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
