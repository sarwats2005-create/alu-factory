import { prisma } from "@/lib/db";
import { ok, fail, handler, AppError, audit } from "@/lib/api";
import { D, toNum } from "@/lib/money";
import { customerBalance } from "@/lib/balances";
import { getSettings } from "@/lib/settings";

export const GET = handler("customers", async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const filter = url.searchParams.get("filter") || "all"; // all | due | settled
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  const where = q ? { fullName: { contains: q, mode: "insensitive" as const } } : {};
  const rate = (await getSettings()).exchangeRate;
  const withBalance = async (c: Awaited<ReturnType<typeof prisma.customer.findMany>>[number]) => {
    const b = await customerBalance(c.id, rate);
    return {
      ...c,
      due: b.usdEquivalent.toFixed(2),
      dueUsd: b.USD.toFixed(2),
      dueIqd: b.IQD.toFixed(2),
      state: b.usdEquivalent.gt(0) ? "due" : b.usdEquivalent.lt(0) ? "credit" : "settled",
    };
  };

  // A balance filter must run before paginating, or pages come back short
  // and the total counts people the filter excluded.
  if (filter !== "all") {
    const all = await Promise.all((await prisma.customer.findMany({ where, orderBy: { fullName: "asc" } })).map(withBalance));
    const matched = all.filter((r) => (filter === "settled" ? r.state !== "due" : r.state === filter));
    return ok({ rows: matched.slice((page - 1) * pageSize, page * pageSize), total: matched.length, page, pageSize });
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { fullName: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.customer.count({ where });
  const rows = await Promise.all(customers.map(withBalance));
  return ok({ rows, total, page, pageSize });
});

export const POST = handler("customers", async (req, user) => {
  const body = await req.json();
  const fullName = String(body.fullName || "").trim();
  if (!fullName) return fail("Full name is required.", 400, "VALIDATION");

  const existing = await prisma.customer.findUnique({ where: { fullName } });
  if (existing) return fail("A customer with this name already exists.", 409, "DUPLICATE");

  const customer = await prisma.customer.create({
    data: {
      fullName,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      photo: body.photo ? String(body.photo) : null,
    },
  });

  await audit(user.id, "CREATE", "CUSTOMERS", customer.id, { fullName });
  return ok({ customer }, 201);
});
