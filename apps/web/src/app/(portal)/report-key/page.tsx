import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { ReportKeySetup } from "@/components/portal/report-key-setup";

export const dynamic = "force-dynamic";

export default async function ReportKeyPage() {
  const user = await requireUser();
  const key = await prisma.userKey.findFirst({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-700">Report access</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Your report key.</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        The final bundle is encrypted in the browser with this key. The server only stores ciphertext and the encrypted private key.
      </p>
      <div className="mt-8 max-w-3xl">
        <ReportKeySetup
          hasKey={Boolean(key)}
          keyId={key?.keyId}
          keyData={key ? {
            keyId: key.keyId,
            publicKeySpki: key.publicKeySpki,
            encryptedPrivateKey: key.encryptedPrivateKey || "",
            kdfSalt: key.kdfSalt || "",
            kdfIters: key.kdfIters || 0,
            createdAt: key.createdAt.toISOString(),
          } : null}
        />
      </div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link className="inline-flex items-center gap-2 text-blue-700 hover:underline" href="/dashboard">
          <Icon name="arrow_back" size={16} /> Dashboard
        </Link>
        <Link className="inline-flex items-center gap-2 text-slate-500 hover:underline" href="/assessments">
          Assessments <Icon name="arrow_forward" size={15} />
        </Link>
      </div>
    </div>
  );
}
