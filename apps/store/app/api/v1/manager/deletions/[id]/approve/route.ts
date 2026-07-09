import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/manager-auth";
import { approveDeletion } from "@/lib/manager/deletion-queue";

/** POST — адмін підтверджує: фіз. видалення (якщо можна) або авто-архів. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin)
    return NextResponse.json({ error: "Лише адміністратор" }, { status: 403 });

  const { id } = await params;
  const res = await approveDeletion(id, admin, req);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    outcome: res.outcome,
    blockers: res.blockers ?? [],
  });
}
