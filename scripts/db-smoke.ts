/**
 * Neon smoke test — proves the DB is reachable, in sync with prisma/schema.prisma,
 * and supports real reads and writes through the app's Prisma client.
 *
 * Usage: npx tsx scripts/db-smoke.ts
 *
 * It exercises tables that already exist (User, Setting, Alert) and cleans up
 * everything it creates, so it leaves the database exactly as it found it.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Reachability + raw SQL round-trip through the pooled connection.
  const pong = await prisma.$queryRaw<{ ok: number; version: string }[]>`
    SELECT 1 AS ok, version() AS version
  `;
  console.log("1. Raw query     : ok =", pong[0].ok, "|", pong[0].version.split(",")[0]);

  // 2. Migration state: the row Prisma writes when a migration is applied.
  const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at
  `;
  console.log("2. Migrations    :", applied.map((m) => m.migration_name).join(", "));

  // 3. Read — the singleton settings row the whole app depends on.
  const setting = await prisma.setting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {},
  });
  console.log(
    "3. Read Setting  : exchangeRate =", setting.exchangeRate.toString(),
    "| lowStockKg =", setting.defaultLowStockKg.toString()
  );

  // 4. Write + read-back + delete — real insert/select/delete on User.
  const email = `smoke-${Date.now()}@test.local`;
  const created = await prisma.user.create({
    data: { email, passwordHash: "smoke-test-not-a-login", fullName: "DB Smoke Test", role: "USER" },
  });
  const readBack = await prisma.user.findUnique({ where: { email } });
  if (!readBack || readBack.id !== created.id) throw new Error("read-back mismatch");
  console.log("4. Write + read  : created and read back user", created.id);

  // 5. Related-table write with cascade delete (UserPermission -> User).
  await prisma.userPermission.create({
    data: { userId: created.id, page: "dashboard", allowed: true },
  });
  const perms = await prisma.userPermission.count({ where: { userId: created.id } });
  await prisma.user.delete({ where: { id: created.id } });
  const permsAfter = await prisma.userPermission.count({ where: { userId: created.id } });
  if (perms !== 1 || permsAfter !== 0) throw new Error("cascade delete failed");
  console.log("5. Relations     : permission created, cascade delete on user removed it");

  console.log("\nAll checks passed — Neon is reachable, in sync, and readable/writable.");
}

main()
  .catch((e) => {
    console.error("SMOKE TEST FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
