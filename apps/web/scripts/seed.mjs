import { createHash } from "node:crypto";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL || "mysql://hmw:hmwpass@127.0.0.1:3307/hmw");
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  }),
});

const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim().toLowerCase() || "admin@hackmywebsite.test";
const demoEmail = "demo@hackmywebsite.test";

const admin = await prisma.user.upsert({
  where: { email: adminEmail },
  update: { role: "ADMIN", emailVerified: new Date() },
  create: { email: adminEmail, name: "Admin", role: "ADMIN", emailVerified: new Date() },
});
await prisma.wallet.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id } });

const demo = await prisma.user.upsert({
  where: { email: demoEmail },
  update: { role: "USER", emailVerified: new Date() },
  create: { email: demoEmail, name: "Demo owner", role: "USER", emailVerified: new Date() },
});
await prisma.wallet.upsert({
  where: { userId: demo.id },
  update: { balanceCents: 50_000 },
  create: { userId: demo.id, balanceCents: 50_000 },
});

await prisma.domain.upsert({
  where: { userId_hostname: { userId: demo.id, hostname: "demo.hackmywebsite.test" } },
  update: { status: "VERIFIED", method: "dev", verifiedMethod: "dev", verifiedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) },
  create: {
    userId: demo.id,
    hostname: "demo.hackmywebsite.test",
    status: "VERIFIED",
    method: "dev",
    verifiedMethod: "dev",
    verifiedAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    evidence: { mode: "seed" },
  },
});

const pool = await prisma.egressPool.upsert({
  where: { cidr: "203.0.113.0/28" },
  update: { provider: "Demo provider", region: "EU", status: "ACTIVE", ptr: "scan-01.hackmywebsite.ai" },
  create: {
    cidr: "203.0.113.0/28",
    provider: "Demo provider",
    region: "EU",
    status: "ACTIVE",
    ptr: "scan-01.hackmywebsite.ai",
    notes: "Demo data. Replace with the leased range before production.",
  },
});

const now = Date.now();
for (let i = 12; i >= 0; i--) {
  const bucketStart = new Date(Math.floor((now - i * 5 * 60 * 1000) / (5 * 60 * 1000)) * 5 * 60 * 1000);
  await prisma.egressMetric.upsert({
    where: { ip_bucketStart: { ip: "203.0.113.10", bucketStart } },
    update: {},
    create: {
      poolId: pool.id,
      ip: "203.0.113.10",
      bucketStart,
      requests: 120 + i * 7,
      bytesIn: BigInt(2_000_000 + i * 100_000),
      bytesOut: BigInt(900_000 + i * 45_000),
      errors: i % 4,
      blocklistHits: 0,
    },
  });
}

const workerToken = process.env.WORKER_TOKEN || "local-worker-token-2026";
const workerPepper = process.env.WORKER_TOKEN_PEPPER || "local-worker-pepper";
const tokenHash = createHash("sha256").update(`${workerToken}:${workerPepper}`).digest("hex");
const worker = await prisma.worker.upsert({
  where: { name: "local-worker" },
  update: { tokenHash, status: "ONLINE", lastSeenAt: new Date(), version: "local-smoke" },
  create: {
    name: "local-worker",
    tokenHash,
    status: "ONLINE",
    version: "local-smoke",
    egressPeer: "local",
    egressIp: "203.0.113.10",
    egressRange: pool.cidr,
  },
});

console.log(JSON.stringify({ admin: admin.email, demo: demo.email, domain: "demo.hackmywebsite.test", pool: pool.cidr, worker: worker.name }, null, 2));
await prisma.$disconnect();
