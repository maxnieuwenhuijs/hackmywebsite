"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { getDevAdmin } from "@/lib/dev-admin";
import { prisma } from "@/lib/db";
import { processEmailOutbox } from "@/lib/email-sender";

async function guard() {
  const dev = await getDevAdmin();
  if (dev) return;
  await requireAdmin();
}

export async function flushEmailAction() {
  await guard();
  await processEmailOutbox(50);
  revalidatePath("/admin/email");
}

export async function retryEmailAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.emailOutbox.update({
    where: { id },
    data: { status: "pending", attempts: 0, error: null, sentAt: null, providerId: null },
  });
  await processEmailOutbox(10);
  revalidatePath("/admin/email");
}
