"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { logoutAction } from "@/app/actions/auth";

const nav = [
  ["dashboard", "/dashboard", "space_dashboard"],
  ["assessments", "/assessments", "radar"],
  ["domains", "/domains", "verified_user"],
  ["wallet", "/wallet", "account_balance_wallet"],
  ["report key", "/report-key", "key"],
  ["notifications", "/notifications", "notifications"],
] as const;

export function PortalShell({
  email,
  name,
  role,
  balance,
  unread,
  children,
}: {
  email: string;
  name: string | null;
  role: string;
  balance: string;
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:flex-row lg:py-10">
      <aside className="lg:w-56 lg:shrink-0">
        <Link className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-slate-900" href="/">
          <span className="flex h-7 w-7 items-center justify-center rounded-[2px] bg-slate-900 text-white">
            <Icon name="shield" size={16} />
          </span>
          HACKMYWEBSITE.AI
        </Link>
        <nav className="mt-6 flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map(([key, href, icon]) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={key}
                href={href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-[2px] px-3 py-2.5 text-sm transition ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon name={icon} size={18} />
                <span className="capitalize">{key}</span>
                {key === "notifications" && unread > 0 ? (
                  <span className="ml-auto rounded-full bg-blue-700 px-1.5 py-0.5 font-mono text-[10px] text-white">{unread}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        {role === "ADMIN" ? (
          <Link className="mt-2 inline-flex items-center gap-2 rounded-[2px] px-3 py-2.5 text-sm text-blue-700 hover:bg-white" href="/admin">
            <Icon name="admin_panel_settings" size={18} />
            Admin
          </Link>
        ) : null}
        <div className="mt-8 hidden border-t border-slate-200 pt-5 lg:block">
          <p className="truncate text-sm font-medium text-slate-900">{name || email}</p>
          <p className="truncate text-xs text-slate-500">{email}</p>
          <form action={logoutAction} className="mt-3">
            <button className="text-xs text-slate-500 hover:text-slate-900" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Icon name="lock" size={15} />
            Authorized assessments only
          </div>
          <div className="flex items-center gap-3">
            <Link href="/wallet" className="inline-flex items-center gap-2 rounded-[2px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-400">
              <Icon name="account_balance_wallet" size={16} />
              {balance}
            </Link>
            <Link href="/notifications" className="relative inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-600 hover:border-slate-400" aria-label="Notifications">
              <Icon name="notifications" size={18} />
              {unread > 0 ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-700" /> : null}
            </Link>
            <Link href="/assessments/new" className="inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800">
              <Icon name="add" size={16} />
              New
            </Link>
          </div>
        </div>
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
