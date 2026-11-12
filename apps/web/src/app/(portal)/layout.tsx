import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { unreadNotificationCount } from "@/lib/notifications";
import { formatUsd } from "@/lib/pricing";
import { PortalShell } from "@/components/portal/shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const unread = await unreadNotificationCount(user.id);
  return (
    <PortalShell
      email={user.email || ""}
      name={user.name}
      role={user.role}
      balance={formatUsd(user.wallet?.balanceCents || 0)}
      unread={unread}
    >
      {children}
    </PortalShell>
  );
}
