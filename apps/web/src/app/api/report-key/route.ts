import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { checkRateLimit, getRequestIp, rateLimitResponse } from "@/lib/rate-limit";

const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = checkRateLimit({
    key: `report-key:${user.id}:${getRequestIp(request)}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: {
    publicKeySpki?: string;
    encryptedPrivateKey?: string;
    kdfSalt?: string;
    kdfIters?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const publicKeySpki = String(body.publicKeySpki || "");
  const encryptedPrivateKey = String(body.encryptedPrivateKey || "");
  const kdfSalt = String(body.kdfSalt || "");
  const kdfIters = Number(body.kdfIters || 0);

  if (!BASE64_RE.test(publicKeySpki) || publicKeySpki.length < 200 || publicKeySpki.length > 4000) {
    return NextResponse.json({ error: "Invalid public key" }, { status: 400 });
  }
  if (!BASE64_RE.test(kdfSalt) || kdfSalt.length < 16 || kdfSalt.length > 200) {
    return NextResponse.json({ error: "Invalid KDF salt" }, { status: 400 });
  }
  if (!Number.isInteger(kdfIters) || kdfIters < 100_000 || kdfIters > 2_000_000) {
    return NextResponse.json({ error: "Invalid KDF iterations" }, { status: 400 });
  }
  try {
    const parsed = JSON.parse(encryptedPrivateKey) as { iv?: unknown; ciphertext?: unknown };
    if (typeof parsed.iv !== "string" || typeof parsed.ciphertext !== "string") throw new Error("shape");
    if (!BASE64_RE.test(parsed.iv) || !BASE64_RE.test(parsed.ciphertext)) throw new Error("base64");
    if (parsed.ciphertext.length < 100) throw new Error("short");
  } catch {
    return NextResponse.json({ error: "Invalid encrypted private key" }, { status: 400 });
  }

  const existing = await prisma.userKey.findFirst({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({ error: "already_configured", keyId: existing.keyId }, { status: 409 });
  }

  const key = await prisma.userKey.create({
    data: {
      userId: user.id,
      keyId: `rk_${randomBytes(12).toString("hex")}`,
      publicKeySpki,
      encryptedPrivateKey,
      kdfSalt,
      kdfIters,
    },
  });

  return NextResponse.json({ keyId: key.keyId });
}
