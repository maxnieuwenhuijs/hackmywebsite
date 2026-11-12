import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { addDomainAction, prepareVerificationAction, sendEmailCodeAction, verifyDomainAction } from "./actions";

export const dynamic = "force-dynamic";

const methodLabel: Record<string, string> = { dns: "DNS TXT", email: "Work email", http: "File or meta", dev: "Local development" };

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; method?: string; token?: string; devCode?: string; sent?: string; verified?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const domains = await prisma.domain.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const selected = params.domain ? domains.find((domain) => domain.id === params.domain) : null;
  const method = params.method || "dns";
  const devVerification = process.env.ALLOW_DEV_VERIFICATION === "1";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Ownership</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Verified domains.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Prove control once with DNS, a file or a role inbox. Verification is rechecked when a run starts.
          </p>
        </div>
      </div>

      {params.verified ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <Icon name="verified_user" size={18} />
          Domain verified. You can select it in a new assessment.
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-6 flex gap-3 rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Icon name="error" size={18} />
          {params.error === "host" ? "Enter a valid public domain." : params.error === "dns" ? "The DNS record was not found or is incorrect." : params.error === "http" ? "The verification file was not found or did not match." : params.error === "code" ? "That code is not correct." : params.error === "rate" ? "Too many verification attempts. Try again later." : "Verification could not be completed."}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          {domains.length === 0 ? (
            <div className="rounded-[2px] border border-slate-200 bg-white px-6 py-12 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-[2px] border border-slate-200 text-slate-400"><Icon name="verified_user" size={22} /></span>
              <p className="mt-4 text-sm font-medium text-slate-900">No domains yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">Add the domain you want assessed and choose how you want to prove ownership.</p>
            </div>
          ) : (
            domains.map((domain) => (
              <div key={domain.id} className="rounded-[2px] border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{domain.hostname}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {domain.status === "VERIFIED" && domain.expiresAt
                        ? `Verified · valid until ${domain.expiresAt.toLocaleDateString("en-GB")}`
                        : "Not verified yet"}
                    </p>
                  </div>
                  <span className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${domain.status === "VERIFIED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{domain.status}</span>
                </div>
                {domain.status !== "VERIFIED" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["dns", "email", "http"].map((value) => (
                      <form key={value} action={prepareVerificationAction}>
                        <input type="hidden" name="domainId" value={domain.id} />
                        <input type="hidden" name="method" value={value} />
                        <button className="rounded-[2px] border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:border-slate-500" type="submit">
                          Set up {methodLabel[value]}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : null}
                <Link className="mt-3 inline-block text-xs text-blue-700 hover:underline" href={`/domains?domain=${domain.id}`}>View verification details</Link>
              </div>
            ))
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-[2px] border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Add a domain</h2>
            <form action={addDomainAction} className="mt-3">
              <label className="text-xs font-medium text-slate-700" htmlFor="hostname">Domain or URL</label>
              <input id="hostname" name="hostname" required placeholder="example.com" className="mt-1.5 w-full rounded-[2px] border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-700" />
              <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm text-white hover:bg-blue-800" type="submit">Add domain <Icon name="add" size={16} /></button>
            </form>
          </div>

          {selected && selected.status !== "VERIFIED" ? (
            <div className="rounded-[2px] border border-blue-200 bg-blue-50/40 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-blue-700">Verify {selected.hostname}</p>
              <h2 className="mt-2 text-sm font-semibold text-slate-900">{methodLabel[method] || "Verification"}</h2>
              {params.token ? (
                <>
                  {method === "dns" ? (
                    <p className="mt-2 text-xs leading-5 text-slate-600">Add a TXT record at <code className="rounded bg-white px-1 py-0.5">_hackmywebsite.{selected.hostname}</code> with this value:</p>
                  ) : method === "http" ? (
                    <p className="mt-2 text-xs leading-5 text-slate-600">Serve this exact text at <code className="rounded bg-white px-1 py-0.5">https://{selected.hostname}/.well-known/hackmywebsite-verification.txt</code>:</p>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-slate-600">Enter this code in the form below, or request a new one.</p>
                  )}
                  <pre className="mt-3 overflow-x-auto rounded-[2px] border border-blue-200 bg-white p-3 font-mono text-[11px] text-slate-700">{params.token}</pre>
                  {method !== "email" ? (
                    <form action={verifyDomainAction} className="mt-3">
                      <input type="hidden" name="domainId" value={selected.id} />
                      <input type="hidden" name="method" value={method} />
                      <input type="hidden" name="token" value={params.token} />
                      <button className="inline-flex items-center gap-2 rounded-[2px] bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800" type="submit">Check now <Icon name="sync" size={15} /></button>
                    </form>
                  ) : null}
                </>
              ) : null}
              {method === "email" ? (
                <div className="mt-3 space-y-3">
                  <form action={sendEmailCodeAction}>
                    <input type="hidden" name="domainId" value={selected.id} />
                    <input name="email" type="email" defaultValue={`security@${selected.hostname}`} className="w-full rounded-[2px] border border-slate-300 px-3 py-2.5 text-sm" />
                    <button className="mt-2 rounded-[2px] border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:border-slate-500" type="submit">Send code</button>
                  </form>
                  {params.devCode ? <p className="rounded-[2px] border border-amber-200 bg-amber-50 p-2 font-mono text-[10px] text-amber-700">Dev code: {params.devCode}</p> : null}
                  <form action={verifyDomainAction} className="flex gap-2">
                    <input type="hidden" name="domainId" value={selected.id} />
                    <input type="hidden" name="method" value="email" />
                    <input name="code" inputMode="numeric" placeholder="000000" className="min-w-0 flex-1 rounded-[2px] border border-slate-300 px-3 py-2.5 font-mono text-sm" />
                    <button className="rounded-[2px] bg-slate-900 px-3 py-2 text-xs text-white" type="submit">Verify</button>
                  </form>
                </div>
              ) : null}
              {devVerification ? (
                <form action={verifyDomainAction} className="mt-3 border-t border-blue-200 pt-3">
                  <input type="hidden" name="domainId" value={selected.id} />
                  <input type="hidden" name="method" value="dev" />
                  <button className="rounded-[2px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" type="submit">Dev verify (local)</button>
                </form>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
