import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { getDevAdmin } from "@/lib/dev-admin";
import { AdminShell } from "@/components/admin/shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const devAdmin = await getDevAdmin();
  const isAdmin = user?.role === "ADMIN";
  if (!isAdmin && !devAdmin) redirect("/login");
  return <AdminShell email={user?.email || devAdmin?.email || "dev admin"} dev={Boolean(devAdmin && !isAdmin)}>{children}</AdminShell>;
}
