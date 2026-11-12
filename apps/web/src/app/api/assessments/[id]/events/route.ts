import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { thoughtFromEvent } from "@/lib/swarm-agents";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const run = await prisma.run.findFirst({
    where: { id, userId: user.id },
    select: {
      status: true,
      events: { where: { type: "thought" }, orderBy: { seq: "asc" }, take: 100 },
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const events = run.events.map(thoughtFromEvent).filter((event): event is NonNullable<typeof event> => Boolean(event));
  return NextResponse.json({ status: run.status, events });
}
