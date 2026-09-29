import { prisma } from "@/lib/db";
import { ok, fail, handler, audit } from "@/lib/api";
import { beneficiaryDue } from "@/lib/balances";

export const GET = handler("beneficiaries", async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25", 10)));

  const where = q ? { fullName: { contains: q, mode: "insensitive" as const } } : {};
  const beneficiaries = await prisma.beneficiary.findMany({
    where,
    orderBy: { fullName: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await prisma.beneficiary.count({ where });

  const rows = await Promise.all(
    beneficiaries.map(async (b) => {
      const due = await beneficiaryDue(b.id);
      return {
        ...b,
        due: due.toFixed(2),
        state: due.gt(0) ? "factory_owes" : due.lt(0) ? "overpaid" : "settled",
      };
    })
  );

  return ok({ rows, total, page, pageSize });
});

export const POST = handler("beneficiaries", async (req, user) => {
  const body = await req.json();
  const fullName = String(body.fullName || "").trim();
  if (!fullName) return fail("Full name is required.", 400, "VALIDATION");

  const existing = await prisma.beneficiary.findUnique({ where: { fullName } });
  if (existing) return fail("A beneficiary with this name already exists.", 409, "DUPLICATE");

  const beneficiary = await prisma.beneficiary.create({
    data: {
      fullName,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
    },
  });

  await audit(user.id, "CREATE", "BENEFICIARIES", beneficiary.id, { fullName });
  return ok({ beneficiary }, 201);
});
