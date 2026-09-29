import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-9f2b7c1e8a4d6f3b"
);
const COOKIE = "alu_session";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: "OWNER" | "USER";
  language: string;
  permissions: Record<string, boolean>;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const uid = payload.uid as string;
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { permissions: true },
    });
    if (!user || !user.active) return null;
    const permissions: Record<string, boolean> = {};
    for (const p of user.permissions) permissions[p.page] = p.allowed;
    if (user.role === "OWNER") {
      for (const pg of PAGES) permissions[pg] = true;
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as "OWNER" | "USER",
      language: user.language,
      permissions,
    };
  } catch {
    return null;
  }
}

export const PAGES = [
  "dashboard",
  "customers",
  "beneficiaries",
  "inventory",
  "pos",
  "invoices",
  "vault",
  "reports",
  "settings",
] as const;

export type Page = (typeof PAGES)[number];

/** Check a session user's access to a page. Owners always allowed. */
export function canAccess(user: SessionUser | null, page: Page): boolean {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  return user.permissions[page] === true;
}
