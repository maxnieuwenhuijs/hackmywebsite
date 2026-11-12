"use server";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";

export async function requestAccess(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const company = String(formData.get("company") ?? "").trim().slice(0, 160);
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase().slice(0, 253);
  const authorized = formData.get("authorized") === "on";

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !authorized) {
    redirect("/signup?error=missing");
  }

  const dir = path.join(process.cwd(), "data");
  await mkdir(dir, { recursive: true });
  await appendFile(
    path.join(dir, "access-requests.jsonl"),
    JSON.stringify({
      at: new Date().toISOString(),
      name,
      email,
      company,
      domain,
    }) + "\n",
    "utf8",
  );

  redirect("/signup?requested=1");
}
