import { prisma } from "./db";
import { AppError } from "./api";

export async function getSettings() {
  let s = await prisma.setting.findUnique({ where: { id: "singleton" } });
  if (!s) {
    s = await prisma.setting.create({ data: { id: "singleton" } });
  }
  return s;
}

export async function requireSettings() {
  const s = await getSettings();
  if (!s) throw new AppError("Settings not initialized", 500);
  return s;
}
