"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";

export async function markNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
