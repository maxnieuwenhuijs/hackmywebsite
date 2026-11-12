import { prisma } from "@/lib/db";

const MAX_ATTEMPTS = 5;

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}

export async function processEmailOutbox(limit = 20) {
  const pending = await prisma.emailOutbox.findMany({
    where: { status: "pending", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
  });
  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    const attempts = item.attempts + 1;
    try {
      let providerId: string;
      if (process.env.RESEND_API_KEY && process.env.ALLOW_DEV_EMAIL !== "1") {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const result = await resend.emails.send({
          from: process.env.EMAIL_FROM || "hackmywebsite.ai <no-reply@hackmywebsite.ai>",
          to: item.toAddress,
          subject: item.subject,
          html: item.html,
          text: item.text,
        });
        if (result.error) throw new Error(result.error.message);
        providerId = result.data?.id || "resend";
      } else if (process.env.ALLOW_DEV_EMAIL === "1") {
        console.log(`[email] dev delivery ${item.kind} -> ${maskEmail(item.toAddress)}`);
        providerId = "dev-log";
      } else {
        throw new Error("Email provider is not configured");
      }
      await prisma.emailOutbox.update({
        where: { id: item.id },
        data: {
          status: "sent",
          attempts,
          sentAt: new Date(),
          providerId,
          error: null,
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.emailOutbox.update({
        where: { id: item.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error: message.slice(0, 2000),
        },
      });
      failed += 1;
    }
  }

  return { pending: pending.length, sent, failed };
}
