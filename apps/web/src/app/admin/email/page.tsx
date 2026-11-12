import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { flushEmailAction, retryEmailAction } from "./actions";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "sent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default async function AdminEmailPage() {
  const [messages, pending, sent, failed] = await Promise.all([
    prisma.emailOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.emailOutbox.count({ where: { status: "pending" } }),
    prisma.emailOutbox.count({ where: { status: "sent" } }),
    prisma.emailOutbox.count({ where: { status: "failed" } }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Email</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Outbox and delivery.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Transactional email only. Report content never goes through this table. In local mode messages are marked sent and logged without the body.
          </p>
        </div>
        <form action={flushEmailAction}>
          <button className="inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm text-white hover:bg-blue-800" type="submit">
            <Icon name="send" size={16} />
            Flush queue
          </button>
        </form>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Pending", pending, "waiting for provider"],
          ["Sent", sent, "accepted by provider or dev log"],
          ["Failed", failed, "needs attention"],
        ].map(([label, value, note]) => (
          <div key={String(label)} className="rounded-[2px] border border-slate-200 bg-white p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-[2px] border border-slate-200 bg-white">
        {messages.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-slate-200 text-slate-400"><Icon name="mail" size={22} /></span>
            <p className="mt-4 text-sm font-medium text-slate-900">Outbox is empty</p>
            <p className="mt-1 text-sm text-slate-500">Delivery emails will appear here after a report is sealed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr><th className="px-4 py-3">To</th><th className="px-4 py-3">Kind</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td className="px-4 py-3 text-xs text-slate-600">{message.toAddress}</td>
                    <td className="px-4 py-3 font-mono text-[10px] uppercase text-slate-500">{message.kind}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{message.subject}</td>
                    <td className="px-4 py-3"><span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase ${statusTone(message.status)}`}>{message.status}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{message.attempts}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{message.createdAt.toLocaleString("en-GB")}</td>
                    <td className="px-4 py-3">
                      {message.status !== "sent" ? (
                        <form action={retryEmailAction}>
                          <input type="hidden" name="id" value={message.id} />
                          <button className="rounded-[2px] border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:border-slate-500" type="submit">Retry</button>
                        </form>
                      ) : <span className="text-[11px] text-slate-400">done</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
