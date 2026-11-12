import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Reveal } from "@/components/reveal";

const steps = [
  {
    icon: "verified_user",
    title: "Prove it is yours",
    text: "DNS, a file, a work email or a signed authorization.",
  },
  {
    icon: "payments",
    title: "Set a cap",
    text: "$50 minimum. You only pay for what the run uses.",
  },
  {
    icon: "hub",
    title: "Agents run",
    text: "Map, probe, prove. One shared board. Hard budget stop.",
  },
  {
    icon: "lock",
    title: "Seal it",
    text: "Encrypted to your key. We never hold the report.",
  },
];

const tiers: Array<{
  name: string;
  budget: string;
  time: string;
  note: string;
  featured?: boolean;
}> = [
  { name: "Starter", budget: "$50", time: "1 to 3 hours", note: "First look. One target." },
  { name: "Standard", budget: "$250", time: "4 to 12 hours", note: "Deeper coverage.", featured: true },
  { name: "Deep", budget: "$1,000", time: "12 to 24 hours", note: "Impact proof. Larger roster." },
  { name: "Enterprise", budget: "$5,000+", time: "1 to 3 days", note: "Scheduled waves." },
];

const roles = [
  ["travel_explore", "Mapper"],
  ["key", "Access"],
  ["bug_report", "Injector"],
  ["bolt", "Impact"],
];

const ownership = [
  ["dns", "DNS TXT", "A token at _hackmywebsite."],
  ["description", "File or meta", "A token on the domain."],
  ["mail", "Work email", "A role inbox at the domain."],
  ["badge", "Manual review", "A signed authorization."],
];

const faqs = [
  ["Is this a penetration test?", "It is an authorized, agent-run security assessment. Every finding carries the request and response that proves it. State-changing exploitation only runs with explicit consent on a verified target."],
  ["What does it cost?", "You choose a budget cap, with a $50 minimum. The budget is a cap, not a fixed fee. Unused budget stays on your account."],
  ["What if nothing is found?", "If coverage is complete and nothing medium or higher is confirmed, the charged amount is credited back minus a flat $15 assessment fee."],
  ["Can you read my report?", "No. The report bundle is encrypted to a key only you hold. Staff and support can download only ciphertext."],
  ["How do you know I own the site?", "Before a run you prove control with DNS, a file, a work email or a signed authorization. The check is repeated when the run starts."],
  ["How long will it take?", "The portal shows your queue position and an ETA window. A $50 run is usually 1 to 3 hours including queue time."],
];

function SectionLabel({
  children,
  dark = false,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <div
      className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
        dark ? "text-slate-500" : "text-slate-400"
      }`}
    >
      {children}
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="font-mono text-[11px] tracking-[0.2em] text-slate-900">
            HACKMYWEBSITE.AI
          </Link>
          <nav className="flex items-center gap-5 text-xs">
            <a className="hidden text-slate-500 hover:text-slate-900 sm:block" href="#pricing">
              Pricing
            </a>
            <Link className="text-slate-500 hover:text-slate-900" href="/login">
              Sign in
            </Link>
            <Link
              className="rounded-[2px] bg-slate-900 px-3 py-2 text-white hover:bg-slate-800"
              href="/start"
            >
              Start
            </Link>
          </nav>
        </div>
      </header>

      <section className="flex min-h-[100svh] items-center border-b border-slate-200 bg-white pb-24 pt-36">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h1 className="max-w-4xl text-[clamp(3.1rem,9vw,7.4rem)] font-semibold leading-[0.9] tracking-[-0.055em] text-slate-900">
            <span className="block">Break in,</span>
            <span className="mt-2 block text-[0.74em] leading-[0.95] tracking-[-0.04em]">
              before they do.
            </span>
          </h1>
          <div className="mt-16 flex flex-wrap items-center gap-8">
            <Link
              className="rounded-[2px] bg-blue-700 px-6 py-3.5 text-sm font-medium text-white hover:bg-blue-800"
              href="/start"
            >
              Start an assessment
            </Link>
            <a className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900" href="#how">
              How it works
              <Icon name="arrow_downward" size={18} />
            </a>
          </div>
          <div className="mt-32 flex items-center justify-between border-t border-slate-200 pt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            <span>Verified domains only</span>
            <span className="hidden sm:block">Budget capped</span>
            <span>Report sealed</span>
          </div>
        </div>
      </section>

      <section id="how" className="border-b border-slate-200 bg-white py-28 sm:py-36">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionLabel>Method</SectionLabel>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Four moves. No noise.
            </h2>
          </Reveal>
          <div className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 70}>
                <div className="h-full rounded-[2px] border border-slate-200 p-7">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-[2px] border border-slate-200 text-slate-500">
                    <Icon name={step.icon} />
                  </span>
                  <h3 className="mt-8 text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-28 sm:py-36">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionLabel>The swarm</SectionLabel>
            <div className="mt-4 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
              <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Optimized agents. One job: find the weakness.
              </h2>
              <p className="max-w-md text-base leading-7 text-slate-600">
                Specialist agents that think like an attacker and prove what they find.
              </p>
            </div>
          </Reveal>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map(([icon, label], index) => (
              <Reveal key={label} delay={index * 60}>
                <div className="flex items-center gap-4 rounded-[2px] border border-slate-200 p-6">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-slate-200 text-slate-500">
                    <Icon name={icon} />
                  </span>
                  <p className="text-base font-medium text-slate-900">{label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="evidence" className="border-b border-slate-200 bg-slate-50 py-28 sm:py-36">
        <div className="mx-auto grid max-w-6xl gap-16 px-6 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <SectionLabel>Evidence</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              A finding is a claim with the receipt.
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-slate-600">
              Every confirmed finding includes the request, the response and the fix.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-[2px] border border-slate-200 bg-white p-7">
              <div className="flex items-center gap-2">
                <span className="rounded-[2px] border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[10px] text-amber-700">
                  HIGH
                </span>
                <span className="rounded-[2px] border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[10px] text-emerald-700">
                  CONFIRMED
                </span>
              </div>
              <p className="mt-6 text-base font-medium text-slate-900">
                Price-alert records are readable without a session
              </p>
              <pre className="mt-4 overflow-x-auto rounded-[2px] bg-slate-50 p-4 font-mono text-[11px] leading-6 text-slate-600">
{`GET /admin/alerts
200 OK
41 rows, 32 unique emails`}
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="pricing" className="border-b border-slate-200 bg-white py-28 sm:py-36">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionLabel>Budget</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Choose the cap.</h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600">
              A cap, not a fixed fee. Unused budget stays.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-6 lg:grid-cols-4">
            {tiers.map((tier, index) => (
              <Reveal key={tier.name} delay={index * 60}>
                <div
                  className={`flex h-full flex-col rounded-[2px] border p-7 ${
                    tier.featured ? "border-blue-700 bg-blue-50/40" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-base font-semibold text-slate-900">{tier.name}</h3>
                    {tier.featured ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-blue-700">
                        most chosen
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-6 font-mono text-3xl text-slate-900">{tier.budget}</p>
                  <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                    <Icon name="schedule" size={14} />
                    {tier.time}
                  </p>
                  <p className="mt-5 text-sm text-slate-500">{tier.note}</p>
                  <Link
                    className={`mt-auto pt-10 text-sm font-medium ${
                      tier.featured ? "text-blue-700" : "text-slate-700"
                    } hover:underline`}
                    href="/start"
                  >
                    Start
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-sm leading-6 text-slate-500">
            Minimum $50. Unused credit expires after 42 days. A clean result is credited back
            minus a flat $15 assessment fee.
          </p>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-900 py-28 text-white sm:py-36">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <Reveal>
              <SectionLabel dark>
                Sealed
              </SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                A report only you can open.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
                Encrypted to a key that never reaches us. A 48-hour code arrives by email.
              </p>
            </Reveal>
            <Reveal delay={100}>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ["schedule", "48h", "code"],
                  ["key", "Your key", "no master"],
                  ["visibility_off", "Ciphertext", "at rest"],
                ].map(([icon, value, label]) => (
                  <div key={label} className="rounded-[2px] border border-slate-700 p-5">
                    <Icon name={icon} size={20} className="text-slate-500" />
                    <p className="mt-6 font-mono text-lg">{value}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-28 sm:py-36">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionLabel>Ownership</SectionLabel>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              We only scan what you can prove.
            </h2>
          </Reveal>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ownership.map(([icon, title, text], index) => (
              <Reveal key={title} delay={index * 60}>
                <div className="h-full rounded-[2px] border border-slate-200 p-7">
                  <Icon name={icon} size={22} className="text-slate-500" />
                  <h3 className="mt-8 text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50 py-28 sm:py-36">
        <div className="mx-auto grid max-w-6xl gap-16 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <SectionLabel>Queue</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              You always know where you are.
            </h2>
            <p className="mt-6 max-w-sm text-base leading-7 text-slate-600">
              Position and ETA from the moment you queue.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <div className="rounded-[2px] border border-slate-200 bg-white p-2">
              <div className="grid grid-cols-2 border-b border-slate-200 px-5 py-4 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <span>budget</span>
                <span>typical time</span>
              </div>
              {[
                ["$50 to $249", "1 to 6 hours"],
                ["$250 to $999", "4 to 24 hours"],
                ["$1,000 to $4,999", "12 to 72 hours"],
                ["$5,000+", "1 to 10 days"],
              ].map(([budget, time]) => (
                <div
                  key={budget}
                  className="grid grid-cols-2 border-b border-slate-100 px-5 py-4 text-sm text-slate-600 last:border-0"
                >
                  <span className="font-mono text-slate-900">{budget}</span>
                  <span>{time}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="faq" className="border-b border-slate-200 bg-white py-28 sm:py-36">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <SectionLabel>FAQ</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Questions.</h2>
          </Reveal>
          <div className="mt-12 max-w-3xl">
            {faqs.map(([question, answer], index) => (
              <Reveal key={question} delay={index * 40}>
                <details className="group border-b border-slate-200 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    {question}
                    <Icon
                      name="add"
                      size={20}
                      className="text-slate-400 transition-transform group-open:rotate-45"
                    />
                  </summary>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">{answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-900 py-28 text-white sm:py-36">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 sm:flex-row sm:items-end sm:justify-between">
          <Reveal>
            <h2 className="max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
              Find out what is exposed.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="flex flex-wrap gap-4">
              <Link
                className="rounded-[2px] bg-white px-6 py-3.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
                href="/start"
              >
                Start
              </Link>
              <a
                className="rounded-[2px] border border-slate-600 px-6 py-3.5 text-sm font-medium text-white hover:border-slate-400"
                href="mailto:hello@hackmywebsite.ai"
              >
                Talk to us
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}




