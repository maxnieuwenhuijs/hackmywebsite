"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { getDevAdmin } from "@/lib/dev-admin";
import { requestRunCancellation } from "@/lib/run-cancel";

export async function cancelRunAction(formData: FormData) {
  const dev = await getDevAdmin();
  let actor = dev?.email || "dev-admin";
  if (!dev) {
    const admin = await requireAdmin();
    actor = admin.email || "admin";
  }
  const runId = String(formData.get("runId") || "");
  if (!runId) return;
  await requestRunCancellation(runId, actor);
  revalidatePath("/admin/runs");
  revalidatePath(`/assessments/${runId}`);
}
