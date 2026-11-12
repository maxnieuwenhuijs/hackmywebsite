import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertStoragePath,
  hashDeliveryCode,
  hashDeliveryToken,
  safeHexEqual,
} from "@/lib/report-delivery";
import { checkRateLimit, getRequestIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limit = checkRateLimit({
    key: `delivery:${getRequestIp(request)}:${hashDeliveryToken(token).slice(0, 24)}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (!limit.allowed) return rateLimitResponse(limit);
  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Enter the delivery code" }, { status: 400 });

  const delivery = await prisma.deliveryCode.findUnique({
    where: { tokenHash: hashDeliveryToken(token) },
    include: { bundle: { include: { run: true } } },
  });
  if (!delivery) return NextResponse.json({ error: "This delivery link is not valid" }, { status: 404 });
  if (delivery.lockedAt) return NextResponse.json({ error: "This delivery code is locked" }, { status: 423 });
  if (delivery.expiresAt < new Date()) return NextResponse.json({ error: "This delivery code has expired" }, { status: 410 });
  if (delivery.downloads >= delivery.maxDownloads) {
    return NextResponse.json({ error: "This delivery code has reached its download limit" }, { status: 410 });
  }

  const supplied = hashDeliveryCode(code);
  if (!safeHexEqual(supplied, delivery.codeHmac)) {
    const attempts = delivery.attempts + 1;
    await prisma.$transaction([
      prisma.deliveryCode.update({
        where: { id: delivery.id },
        data: { attempts, lockedAt: attempts >= 10 ? new Date() : null },
      }),
      prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, kind: "wrong_code" } }),
    ]);
    return NextResponse.json({ error: "That delivery code is not correct" }, { status: 401 });
  }

  const key = await prisma.userKey.findUnique({ where: { keyId: delivery.bundle.keyId } });
  if (!key?.encryptedPrivateKey || !key.kdfSalt || !key.kdfIters || key.revokedAt) {
    return NextResponse.json({ error: "The report key for this bundle is not available" }, { status: 410 });
  }

  let ciphertext: Buffer;
  try {
    const filePath = assertStoragePath(delivery.bundle.storageKey);
    ciphertext = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "The encrypted bundle is not available" }, { status: 410 });
  }

  await prisma.$transaction([
    prisma.deliveryCode.update({
      where: { id: delivery.id },
      data: { downloads: { increment: 1 }, lastUsedAt: new Date() },
    }),
    prisma.deliveryEvent.create({ data: { deliveryId: delivery.id, kind: "unlock" } }),
  ]);

  return NextResponse.json({
    report: {
      host: delivery.bundle.run.host,
      createdAt: delivery.bundle.createdAt.toISOString(),
    },
    envelope: delivery.bundle.envelope,
    ciphertext: ciphertext.toString("base64"),
    key: {
      publicKeySpki: key.publicKeySpki,
      encryptedPrivateKey: key.encryptedPrivateKey,
      kdfSalt: key.kdfSalt,
      kdfIters: key.kdfIters,
    },
    delivery: {
      expiresAt: delivery.expiresAt.toISOString(),
      downloads: delivery.downloads + 1,
      maxDownloads: delivery.maxDownloads,
    },
  });
}
