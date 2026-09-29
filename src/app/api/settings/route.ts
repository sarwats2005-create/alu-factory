import { prisma } from "@/lib/db";
import { ok, fail, handler, audit, AppError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { D } from "@/lib/money";

export const GET = handler("settings", async () => {
  const s = await getSettings();
  return ok({ settings: s });
});

export const PUT = handler("settings", async (req, user) => {
  const body = await req.json();
  const s = await getSettings();

  // Owner-only fields
  const isOwner = user.role === "OWNER";
  if ((!isOwner) && (body.exchangeRate !== undefined || body.emailDaily !== undefined || body.emailWeekly !== undefined || body.emailReportsTo !== undefined || body.autoBackup !== undefined)) {
    return fail("Only the Owner can change these settings.", 403, "FORBIDDEN");
  }

  const data: any = {};

  // Exchange rate change → log it
  if (body.exchangeRate !== undefined) {
    const newRate = D(body.exchangeRate);
    if (newRate.lte(0)) return fail("Exchange rate must be greater than 0.", 400, "VALIDATION");
    if (!newRate.eq(D(s.exchangeRate))) {
      await prisma.exchangeRateLog.create({
        data: {
          oldRate: s.exchangeRate,
          newRate,
          changedById: user.id,
        },
      });
      data.exchangeRate = newRate;
    }
  }

  if (body.defaultLowStockKg !== undefined) data.defaultLowStockKg = D(body.defaultLowStockKg);
  if (body.overdueDays !== undefined) data.overdueDays = parseInt(body.overdueDays, 10) || 30;
  if (body.customerDueThreshold !== undefined) data.customerDueThreshold = D(body.customerDueThreshold);
  if (body.beneficiaryDueThreshold !== undefined) data.beneficiaryDueThreshold = D(body.beneficiaryDueThreshold);
  if (body.vaultLowThresholdUsd !== undefined) data.vaultLowThresholdUsd = D(body.vaultLowThresholdUsd);
  if (body.alertCustomerDue !== undefined) data.alertCustomerDue = !!body.alertCustomerDue;
  if (body.alertBeneficiaryDue !== undefined) data.alertBeneficiaryDue = !!body.alertBeneficiaryDue;
  if (body.alertLowStock !== undefined) data.alertLowStock = !!body.alertLowStock;
  if (body.alertVaultLow !== undefined) data.alertVaultLow = !!body.alertVaultLow;
  if (body.alertOverdue !== undefined) data.alertOverdue = !!body.alertOverdue;
  if (isOwner) {
    if (body.emailDaily !== undefined) data.emailDaily = !!body.emailDaily;
    if (body.emailWeekly !== undefined) data.emailWeekly = !!body.emailWeekly;
    if (body.emailReportsTo !== undefined) data.emailReportsTo = body.emailReportsTo || null;
    if (body.autoBackup !== undefined) data.autoBackup = !!body.autoBackup;
  }

  const updated = await prisma.setting.update({ where: { id: "singleton" }, data });
  await audit(user.id, "UPDATE", "SETTINGS", "singleton", data);
  return ok({ settings: updated });
});
