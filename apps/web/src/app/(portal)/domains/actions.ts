"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveTxt } from "node:dns/promises";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { codeFor, createVerification, hashToken, hashCode, markVerified, safeHost, tokenFor } from "@/lib/verification";
import { notify, emailShell } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import { processEmailOutbox } from "@/lib/email-sender";

export async function prepareVerificationAction(formData: FormData) {
  const user = await requireUser();
  const domainId = String(formData.get("domainId") || "");
  const method = String(formData.get("method") || "dns");
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId: user.id } });
  if (!domain) redirect("/domains?error=domain");
  const { token } = await createVerification(domain.id, method);
  revalidatePath("/domains");
  redirect(`/domains?domain=${domain.id}&method=${method}&token=${encodeURIComponent(token)}`);
}

export async function addDomainAction(formData: FormData) {
  const user = await requireUser();
  const limit = checkRateLimit({ key: `domain-add:${user.id}`, limit: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) redirect("/domains?error=rate");
  const host = safeHost(String(formData.get("hostname") || ""));
  if (!host) redirect("/domains?error=host");
  const existing = await prisma.domain.findFirst({ where: { userId: user.id, hostname: host } });
  if (existing) redirect(`/domains?domain=${existing.id}`);
  const domain = await prisma.domain.create({
    data: { userId: user.id, hostname: host, status: "PENDING" },
  });
  const { token } = await createVerification(domain.id, "dns");
  revalidatePath("/domains");
  redirect(`/domains?domain=${domain.id}&method=dns&token=${encodeURIComponent(token)}`);
}

export async function verifyDomainAction(formData: FormData) {
  const user = await requireUser();
  const limit = checkRateLimit({ key: `domain-verify:${user.id}`, limit: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) redirect("/domains?error=rate");
  const domainId = String(formData.get("domainId") || "");
  const method = String(formData.get("method") || "dns");
  const token = String(formData.get("token") || "");
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId: user.id } });
  if (!domain) redirect("/domains?error=domain");

  if (method === "dev") {
    if (process.env.ALLOW_DEV_VERIFICATION !== "1") redirect("/domains?error=method");
    await markVerified(domain.id, "dev", { mode: "local-dev", checkedAt: new Date().toISOString() });
    await notify({ userId: user.id, kind: "verification", title: `${domain.hostname} verified`, body: "Local development verification was accepted.", href: "/domains" });
    revalidatePath("/domains");
    redirect("/domains?verified=1");
  }

  if (method === "email") {
    const code = String(formData.get("code") || "").trim();
    const verification = await prisma.domainVerification.findFirst({
      where: { domainId: domain.id, method: "email", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!verification || verification.tokenHash !== hashCode(code)) redirect("/domains?error=code");
    await markVerified(domain.id, "email", { codeCheckedAt: new Date().toISOString() });
    await notify({ userId: user.id, kind: "verification", title: `${domain.hostname} verified`, body: "The work email code was accepted.", href: "/domains" });
    revalidatePath("/domains");
    redirect("/domains?verified=1");
  }

  if (method === "dns") {
    let records: string[][] = [];
    try { records = await resolveTxt(`_hackmywebsite.${domain.hostname}`); } catch { redirect("/domains?error=dns"); }
    const value = records.flat().join(" ");
    const verification = await prisma.domainVerification.findFirst({
      where: { domainId: domain.id, method: "dns", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!verification || verification.tokenHash !== hashToken(token) || !value.includes(token)) redirect("/domains?error=dns");
    await markVerified(domain.id, "dns", { record: value, checkedAt: new Date().toISOString() });
    await notify({ userId: user.id, kind: "verification", title: `${domain.hostname} verified`, body: "The DNS TXT record was accepted.", href: "/domains" });
    revalidatePath("/domains");
    redirect("/domains?verified=1");
  }

  if (method === "http") {
    const verification = await prisma.domainVerification.findFirst({
      where: { domainId: domain.id, method: "http", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    let body = "";
    try {
      const response = await fetch(`https://${domain.hostname}/.well-known/hackmywebsite-verification.txt`, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      body = await response.text();
    } catch {
      redirect("/domains?error=http");
    }
    let matches = body.trim() === token;
    if (!matches) {
      try {
        const html = await fetch(`https://${domain.hostname}/`, {
          redirect: "follow",
          signal: AbortSignal.timeout(10_000),
        }).then((response) => response.text());
        const meta = html.match(/<meta\s+[^>]*name=["']hackmywebsite-verification["'][^>]*content=["']([^"']+)["']/i);
        matches = meta?.[1] === token;
      } catch {
        matches = false;
      }
    }
    if (!verification || verification.tokenHash !== hashToken(token) || !matches) redirect("/domains?error=http");
    await markVerified(domain.id, "http", { checkedAt: new Date().toISOString() });
    await notify({ userId: user.id, kind: "verification", title: `${domain.hostname} verified`, body: "The verification file was accepted.", href: "/domains" });
    revalidatePath("/domains");
    redirect("/domains?verified=1");
  }

  redirect("/domains?error=method");
}

export async function sendEmailCodeAction(formData: FormData) {
  const user = await requireUser();
  const limit = checkRateLimit({ key: `email-code:${user.id}`, limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) redirect("/domains?error=rate");
  const domainId = String(formData.get("domainId") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId: user.id } });
  if (!domain || !email.endsWith(`@${domain.hostname}`)) redirect("/domains?error=email");
  const code = codeFor();
  await prisma.domainVerification.create({
    data: {
      domainId: domain.id,
      method: "email",
      tokenHash: hashCode(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  const subject = `Verification code for ${domain.hostname}`;
  const text = `Your verification code is ${code}. It expires in 15 minutes.`;
  await prisma.emailOutbox.create({
    data: {
      userId: user.id,
      kind: "domain_verification",
      toAddress: email,
      subject,
      html: emailShell("Verify your domain", `Your verification code is <strong>${code}</strong>. It expires in 15 minutes.`, `${process.env.NEXT_PUBLIC_APP_URL || ""}/domains?domain=${domain.id}`),
      text: `${text}\n\n${process.env.NEXT_PUBLIC_APP_URL || ""}/domains?domain=${domain.id}`,
    },
  });
  await processEmailOutbox(5).catch((error) => console.error("[email] domain verification", error));
  revalidatePath("/domains");
  const dev = process.env.ALLOW_DEV_EMAIL === "1" ? `&devCode=${encodeURIComponent(code)}` : "";
  redirect(`/domains?domain=${domain.id}&method=email&sent=1${dev}`);
}

export async function verifyEmailCodeAction(formData: FormData) {
  return verifyDomainAction(formData);
}
