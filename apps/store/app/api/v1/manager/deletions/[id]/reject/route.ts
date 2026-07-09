import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/manager-auth";
import { rejectDeletion } from "@/lib/manager/deletion-queue";

const schema = z.object({ note: z.string().trim().max(1000).optional() });

/** POST — адмін відхиляє запит: знімає позначку, обʼєкт повертається. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(req);
  if (!admin)
    return NextResponse.json({ error: "Лише адміністратор" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  const note = parsed.success ? (parsed.data.note ?? null) : null;

  const res = await rejectDeletion(id, admin, note, req);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
