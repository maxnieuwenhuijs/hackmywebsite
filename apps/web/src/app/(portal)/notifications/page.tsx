import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { markNotificationsRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Notifications</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">What changed.</h1>
          <p className="mt-2 text-sm text-slate-500">Queue updates, briefings and delivery codes.</p>
        </div>
        <form action={markNotificationsRead}>
          <button className="rounded-[2px] border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:border-slate-500" type="submit">Mark all read</button>
        </form>
      </div>

      <div className="mt-8 overflow-hidden rounded-[2px] border border-slate-200 bg-white">
        {notifications.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-slate-200 text-slate-400"><Icon name="notifications_none" size={22} /></span>
            <p className="mt-4 text-sm font-medium text-slate-900">Nothing yet</p>
            <p className="mt-1 text-sm text-slate-500">We will notify you when a run starts or a briefing is ready.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <Link key={notification.id} href={notification.href || "/dashboard"} className={`block px-5 py-4 hover:bg-slate-50 ${notification.readAt ? "" : "bg-blue-50/30"}`}>
                <div className="flex items-start gap-3">
                  <Icon name={notification.readAt ? "notifications_none" : "notifications_active"} size={18} className={notification.readAt ? "mt-0.5 text-slate-400" : "mt-0.5 text-blue-700"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                      <p className="font-mono text-[10px] text-slate-400">{notification.createdAt.toLocaleString("en-GB")}</p>
                    </div>
                    {notification.body ? <p className="mt-1 text-sm leading-6 text-slate-500">{notification.body}</p> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
