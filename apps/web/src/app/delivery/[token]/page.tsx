import Link from "next/link";
import { prisma } from "@/lib/db";
import { hashDeliveryToken } from "@/lib/report-delivery";
import { Icon } from "@/components/icon";
import { DeliveryUnlock } from "@/components/delivery-unlock";

export const dynamic = "force-dynamic";

export default async function DeliveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const delivery = await prisma.deliveryCode.findUnique({
    where: { tokenHash: hashDeliveryToken(token) },
    include: { bundle: { include: { run: true } } },
  });
  const devCode = process.env.ALLOW_DEV_EMAIL === "1" ? process.env.DEV_DELIVERY_CODE : undefined;
  const available = delivery && !delivery.lockedAt && delivery.expiresAt > new Date() && delivery.downloads < delivery.maxDownloads;

  if (!available) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6 py-16">
        <Link className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-900" href="/">
          <Icon name="arrow_back" size={16} /> hackmywebsite.ai
        </Link>
        <div className="mt-8 rounded-[2px] border border-slate-200 bg-white p-6">
          <Icon name="link_off" size={24} className="text-slate-400" />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">This delivery link is not available.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            The code may have expired, reached its download limit or been locked. The encrypted report stays in the account. A logged-in owner can issue a new delivery code.
          </p>
          <Link className="mt-5 inline-flex items-center gap-2 rounded-[2px] bg-blue-700 px-4 py-2.5 text-sm text-white hover:bg-blue-800" href="/login">
            Sign in to reissue
            <Icon name="arrow_forward" size={16} />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-900" href="/">
        <Icon name="arrow_back" size={16} /> hackmywebsite.ai
      </Link>
      <div className="mt-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Sealed delivery</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Open your report.</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          The bundle for {delivery.bundle.run.host} is encrypted end to end. Enter the 48-hour code from the email and your report passphrase. Decryption happens in this browser.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Link expires {delivery.expiresAt.toLocaleString("en-GB")}. {delivery.maxDownloads - delivery.downloads} downloads left.
        </p>
      </div>
      <div className="mt-6">
        <DeliveryUnlock token={token} devCode={devCode} />
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
        <Icon name="lock" size={14} />
        Support cannot decrypt or reset your report passphrase.
      </p>
    </main>
  );
}
