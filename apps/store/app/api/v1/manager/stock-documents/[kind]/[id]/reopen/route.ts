import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { reopenStockDoc } from "@/lib/manager/stock-documents-repo";

/**
 * POST /api/v1/manager/stock-documents/[kind]/[id]/reopen — розпровести
 * документ (posted → draft) для повторного редагування. Реверсує ефекти
 * проведення (рухи складу / повний цикл перепаковки / рух боргу).
 */

const WRITE_ROLES = ["manager", "admin", "owner", "warehouse"] as const;
const REPACK_ROLES = ["warehouse", "admin", "owner"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isStockDocKind(kind))
    return NextResponse.json({ error: "Невідомий тип" }, { status: 404 });
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const allowed =
    kind === "repackings"
      ? (REPACK_ROLES as readonly string[])
      : (WRITE_ROLES as readonly string[]);
  if (!allowed.includes(user.role))
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });

  try {
    const r = await reopenStockDoc(kind, id);
    if (!r.ok) {
      const msg =
        r.reason === "not_found"
          ? "Документ не знайдено"
          : r.reason === "not_posted"
            ? "Документ не проведено"
            : (r.reason ?? "Помилка");
      return NextResponse.json(
        { error: msg },
        { status: r.reason === "not_found" ? 404 : 409 },
      );
    }
    return NextResponse.json({ id });
  } catch (err) {
    console.error("[L-TEX] Stock doc reopen failed", {
      kind,
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка розпроведення" },
      { status: 500 },
    );
  }
}
