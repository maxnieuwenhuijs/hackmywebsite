import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Icon } from "@/components/icon";

export const metadata = { title: "Sign in | hackmywebsite.ai" };
export const dynamic = "force-dynamic";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/login?error=email");
  if (process.env.RESEND_API_KEY) {
    await signIn("resend", { email, redirectTo: "/dashboard" });
  } else if (process.env.ALLOW_DEV_LOGIN === "1") {
    await signIn("dev", { email, redirectTo: "/dashboard" });
  } else {
    redirect("/login?error=config");
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const params = await searchParams;
  const dev = process.env.ALLOW_DEV_LOGIN === "1";
  const error = params.error;

  return (
    <main className="mx-auto grid min-h-[80vh] max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1fr_420px] lg:items-center">
      <section>
        <Link className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-900" href="/">
          <Icon name="arrow_back" size={16} />
          hackmywebsite.ai
        </Link>
        <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Portal</p>
        <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-0.04em] text-slate-900 sm:text-6xl">
          Sign in and see what is exposed.
        </h1>
        <p className="mt-6 max-w-md text-base leading-7 text-slate-600">
          A magic link keeps the account simple. Your balance, verified domains and assessments
          are in one place.
        </p>
        <div className="mt-10 grid max-w-md gap-4 text-sm text-slate-600">
          {[
            ["verified_user", "Verify a domain you own with DNS, a file or a work inbox."],
            ["payments", "Top up once. Unused budget stays on your account."],
            ["monitoring", "Get notified when the swarm starts and when a briefing is ready."],
          ].map(([icon, text]) => (
            <div key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-500">
                <Icon name={icon} size={18} />
              </span>
              <p className="leading-6">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          {dev ? (
            <span className="rounded-[2px] border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700">
              local mode
            </span>
          ) : null}
        </div>
        {params.sent ? (
          <div className="mt-5 flex gap-3 rounded-[2px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <Icon name="mark_email_read" size={18} />
            <p>Check your inbox for the sign-in link.</p>
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 flex gap-3 rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <Icon name="error" size={18} />
            <p>
              {error === "email"
                ? "Enter a valid email address."
                : error === "config"
                  ? "Sign-in email is not configured yet."
                  : "That sign-in link did not work. Try again."}
            </p>
          </div>
        ) : null}
        <form action={loginAction} className="mt-6">
          <label className="text-xs font-medium text-slate-700" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            defaultValue={dev ? "admin@hackmywebsite.test" : ""}
            className="mt-2 w-full rounded-[2px] border border-slate-300 px-3 py-3 text-sm outline-none transition focus:border-blue-700"
          />
          <button
            type="submit"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[2px] bg-blue-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-800"
          >
            {dev ? "Enter local portal" : "Send magic link"}
            <Icon name="arrow_forward" size={18} />
          </button>
        </form>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          {dev
            ? "Local mode signs you in immediately. This is disabled in production."
            : "We only use this address for your account, notifications and delivery codes."}
        </p>
        <div className="mt-6 flex gap-4 border-t border-slate-100 pt-5 text-sm">
          <Link className="text-blue-700 hover:underline" href="/">
            Back to the site
          </Link>
          <a className="text-slate-500 hover:underline" href="mailto:hello@hackmywebsite.ai">
            Need help?
          </a>
        </div>
      </section>
    </main>
  );
}
