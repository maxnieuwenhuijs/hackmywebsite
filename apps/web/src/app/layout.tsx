import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "hackmywebsite.ai | Security assessments, agent-run",
  description:
    "Choose a budget. We queue specialist security agents against a site you own. Get evidence-backed findings and a sealed report only you can open.",
  metadataBase: new URL("https://hackmywebsite.ai"),
  openGraph: {
    title: "hackmywebsite.ai | Security assessments, agent-run",
    description:
      "Agent-run security assessments with a prepaid budget, verified ownership and a sealed report delivered by a 48-hour code.",
    url: "https://hackmywebsite.ai",
    siteName: "hackmywebsite.ai",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Fira+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono uppercase tracking-[0.14em]">hackmywebsite.ai</p>
            <p>
              Authorized assessments only. Ownership is verified before a run starts.
            </p>
            <div className="flex gap-5">
              <Link className="hover:text-slate-900" href="/pricing">
                Pricing
              </Link>
              <Link className="hover:text-slate-900" href="/start">
                Start
              </Link>
              <Link className="hover:text-slate-900" href="/login">
                Sign in
              </Link>
              <a className="hover:text-slate-900" href="mailto:hello@hackmywebsite.ai">
                Contact
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

