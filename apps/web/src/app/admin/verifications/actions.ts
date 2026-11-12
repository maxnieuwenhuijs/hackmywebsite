"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { getDevAdmin } from "@/lib/dev-admin";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

async function guard() {
  const dev = await getDevAdmin();
  if (dev) return;
  await requireAdmin();
}

export async function approveDomainAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") || "");
  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) return;
  await prisma.domain.update({
    where: { id },
    data: {
      status: "VERIFIED",
      method: "manual",
      verifiedMethod: "manual",
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      evidence: { mode: "manual-admin-review", reviewedAt: new Date().toISOString() },
    },
  });
  await notify({
    userId: domain.userId,
    kind: "verification",
    title: `${domain.hostname} verified`,
    body: "An operator reviewed the ownership proof and approved the domain.",
    href: "/domains",
  });
  revalidatePath("/admin/verifications");
  revalidatePath("/domains");
}
