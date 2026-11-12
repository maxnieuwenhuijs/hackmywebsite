import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const DEV_ADMIN_COOKIE = "hmw_dev_admin";
export const DEV_ADMIN_TTL_SECONDS = 12 * 60 * 60;

export function devAdminEnabled(): boolean {
  return process.env.ALLOW_DEV_ADMIN === "1";
}

function secret(): string {
  return process.env.DEV_ADMIN_SECRET || process.env.AUTH_SECRET || "dev-only-insecure-secret";
}

export function signDevAdminToken(expiresAt: number): string {
  const payload = `admin.${expiresAt}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyDevAdminToken(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [role, expiresRaw, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (role !== "admin" || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = createHmac("sha256", secret())
    .update(`admin.${expiresAt}`)
    .digest("hex");

  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function devAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.DEV_ADMIN_SECURE === "1",
    path: "/",
    maxAge: DEV_ADMIN_TTL_SECONDS,
  };
}

export async function getDevAdmin(): Promise<{ email: string; role: "ADMIN" } | null> {
  if (!devAdminEnabled()) return null;
  const store = await cookies();
  if (!verifyDevAdminToken(store.get(DEV_ADMIN_COOKIE)?.value)) return null;
  return { email: "dev@hackmywebsite.ai", role: "ADMIN" };
}
