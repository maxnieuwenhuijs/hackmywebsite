"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { getDevAdmin } from "@/lib/dev-admin";

async function guard() {
  const dev = await getDevAdmin();
  if (dev) return;
  await requireAdmin();
}

export async function setEgressStatusAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "ACTIVE");
  if (!["ACTIVE", "QUARANTINED", "RESERVED", "OFFLINE"].includes(status)) return;
  await prisma.egressPool.update({ where: { id }, data: { status: status as "ACTIVE" | "QUARANTINED" | "RESERVED" | "OFFLINE" } });
  revalidatePath("/admin/egress");
}
