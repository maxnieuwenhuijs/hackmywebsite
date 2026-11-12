import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

const PEPPER = process.env.DELIVERY_CODE_PEPPER || "local-dev-pepper";

export function normalizeHost(input: string): string | null {
  let url: URL;
  try {
    url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host || host.includes("..") || host.startsWith(".") || host.endsWith(".")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return null;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  return host;
}

export function safeHost(input: string): string | null {
  const host = normalizeHost(input);
  if (!host) return null;
  if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return null;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
  return host;
}

export function tokenFor() {
  return `hmw-verify=${randomBytes(24).toString("hex")}`;
}

export function hashToken(token: string) {
  return createHash("sha256").update(`${token}:${PEPPER}`).digest("hex");
}

export function codeFor() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function hashCode(code: string) {
  return createHash("sha256").update(`${code}:${PEPPER}`).digest("hex");
}

export async function createVerification(domainId: string, method: string) {
  const token = method === "email" ? codeFor() : tokenFor();
  const record = await prisma.domainVerification.create({
    data: {
      domainId,
      method,
      tokenHash: method === "email" ? hashCode(token) : hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { record, token };
}

export async function markVerified(domainId: string, method: string, evidence: unknown) {
  await prisma.$transaction([
    prisma.domain.update({
      where: { id: domainId },
      data: {
        status: "VERIFIED",
        method,
        verifiedMethod: method,
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        evidence: evidence as object,
      },
    }),
    prisma.domainVerification.updateMany({
      where: { domainId, usedAt: null },
      data: { usedAt: new Date(), verifiedAt: new Date(), evidence: evidence as object },
    }),
  ]);
}
