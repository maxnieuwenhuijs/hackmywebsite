"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { logoutAction } from "@/app/actions/auth";

const nav = [
  ["/admin", "Overview", "space_dashboard"],
  ["/admin/runs", "Runs", "radar"],
  ["/admin/customers", "Customers", "group"],
  ["/admin/verifications", "Verifications", "verified_user"],
  ["/admin/payments", "Payments", "payments"],
  ["/admin/email", "Email", "mail"],
  ["/admin/workers", "Workers", "precision_manufacturing"],
  ["/admin/egress", "Egress", "dns"],
  ["/admin/audit", "Audit", "policy"],
] as const;

export function AdminShell({ email, dev, children }: { email: string; dev: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:flex-row lg:py-10">
      <aside className="lg:w-56 lg:shrink-0">
        <Link className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-slate-900" href="/admin">
          <span className="flex h-7 w-7 items-center justify-center rounded-[2px] bg-slate-900 text-white"><Icon name="admin_panel_settings" size={16} /></span>
          HMW / OPS
        </Link>
        <nav className="mt-6 flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
          {nav.map(([href, label, icon]) => {
            const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} className={`inline-flex shrink-0 items-center gap-2 rounded-[2px] px-3 py-2.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}>
                <Icon name={icon} size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-8 hidden border-t border-slate-200 pt-5 lg:block">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-900">{email}</p>
          {dev ? <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-amber-700">dev session</p> : null}
          <form action={logoutAction} className="mt-3"><button className="text-xs text-slate-500 hover:text-slate-900" type="submit">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Operations</p>
          <Link className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900" href="/dashboard"><Icon name="open_in_new" size={15} /> Customer view</Link>
        </div>
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
