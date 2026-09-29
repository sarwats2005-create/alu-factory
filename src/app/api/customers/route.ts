import { prisma } from "@/lib/db";
import { ok, fail, handler, AppError, audit } from "@/lib/api";
import { D, toNum } from "@/lib/money";
import { customerDue } from "@/lib/balances";

export const GET = handler("customers", async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const filter = url.searchParams.get("filter") || "all"; // all | due | settled
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  const where = q ? { fullName: { contains: q, mode: "insensitive" as const } } : {};
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { fullName: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.customer.count({ where });

  // Compute balances
  const rows = await Promise.all(
    customers.map(async (c) => {
      const due = await customerDue(c.id);
      return {
        ...c,
        due: due.toFixed(2),
        state: due.gt(0) ? "due" : "settled",
      };
    })
  );

  const filtered = filter === "all" ? rows : rows.filter((r) => r.state === filter);

  return ok({ rows: filtered, total, page, pageSize });
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
