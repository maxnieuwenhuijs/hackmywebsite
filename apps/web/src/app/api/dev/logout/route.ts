import { NextResponse } from "next/server";
import { DEV_ADMIN_COOKIE } from "@/lib/dev-admin";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(DEV_ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
