import { NextResponse } from "next/server";
import {
  DEV_ADMIN_COOKIE,
  DEV_ADMIN_TTL_SECONDS,
  devAdminCookieOptions,
  devAdminEnabled,
  signDevAdminToken,
} from "@/lib/dev-admin";

export async function POST(request: Request) {
  if (!devAdminEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const expiresAt = Date.now() + DEV_ADMIN_TTL_SECONDS * 1000;
  const token = signDevAdminToken(expiresAt);
  const response = NextResponse.redirect(new URL("/admin", request.url), 303);
  response.cookies.set(DEV_ADMIN_COOKIE, token, devAdminCookieOptions());
  return response;
}
