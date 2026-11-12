import Link from "next/link";
import { notFound } from "next/navigation";
import { devAdminEnabled } from "@/lib/dev-admin";

export const metadata = {
  title: "Dev admin | hackmywebsite.ai",
};

export const dynamic = "force-dynamic";

export default function DevLoginPage() {
  if (!devAdminEnabled()) notFound();

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-700">Local only</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Dev admin session.</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        This shortcut exists only while the real Auth.js admin login is being built. It is
        enabled by <code className="font-mono text-[12px]">ALLOW_DEV_ADMIN=1</code> and returns
        404 when that variable is absent. Never enable it in production.
      </p>
      <form action="/api/dev/login" method="post" className="mt-8">
        <div className="rounded-[2px] border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">dev@hackmywebsite.ai</span>
            <span className="rounded-[2px] border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700">
              admin
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            No password, no signup, no email. A signed 12-hour cookie is issued for this browser.
          </p>
          <button
            type="submit"
            className="mt-4 w-full rounded-[2px] bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Enter as dev admin
          </button>
        </div>
      </form>
      <div className="mt-6 flex gap-4 text-sm">
        <Link className="text-blue-700 hover:underline" href="/">
          Back to the site
        </Link>
        <Link className="text-slate-600 hover:underline" href="/login">
          Normal sign-in
        </Link>
      </div>
    </main>
  );
}
