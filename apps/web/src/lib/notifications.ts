import { prisma } from "@/lib/db";

export function emailShell(title: string, body: string, href?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#64748b">hackmywebsite.ai</p><h1 style="font-size:24px;line-height:1.2;margin:18px 0">${title}</h1><p style="font-size:15px;line-height:1.7;color:#334155">${body}</p>${href ? `<p style="margin-top:24px"><a href="${href}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;text-decoration:none;border-radius:2px">Open portal</a></p>` : ""}<p style="margin-top:32px;font-size:12px;color:#94a3b8">Authorized assessments only. This message contains no report content.</p></div></body></html>`;
}

export async function notify(input: {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  email?: boolean;
  to?: string;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
    },
  });
  if (input.email && input.to) {
    await prisma.emailOutbox.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        toAddress: input.to,
        subject: input.title,
        html: emailShell(input.title, input.body || "", input.href ? `${process.env.NEXT_PUBLIC_APP_URL || ""}${input.href}` : undefined),
        text: `${input.title}\n\n${input.body || ""}\n\n${input.href ? `${process.env.NEXT_PUBLIC_APP_URL || ""}${input.href}` : ""}`,
      },
    });
  }
  return notification;
}

export async function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
