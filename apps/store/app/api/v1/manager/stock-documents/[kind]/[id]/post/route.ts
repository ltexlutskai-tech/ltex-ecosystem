import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { postStockDoc } from "@/lib/manager/stock-documents-repo";

/** POST /api/v1/manager/stock-documents/[kind]/[id]/post — провести документ. */

const POST_ROLES = ["manager", "admin", "owner", "warehouse"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isStockDocKind(kind)) return NextResponse.json({ error: "Невідомий тип" }, { status: 404 });
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (!(POST_ROLES as readonly string[]).includes(user.role)) return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  const result = await postStockDoc(kind, id, user.id);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason ?? "Не вдалось провести" }, { status });
  }
  return NextResponse.json({ ok: true });
}
