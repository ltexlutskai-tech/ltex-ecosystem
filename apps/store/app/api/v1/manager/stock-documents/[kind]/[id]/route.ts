import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  isStockDocKind,
  parseCreateBody,
} from "@/lib/manager/stock-documents-api";
import {
  getStockDocStatus,
  updateStockDoc,
} from "@/lib/manager/stock-documents-repo";

/**
 * PATCH /api/v1/manager/stock-documents/[kind]/[id] — автозбереження чернетки.
 *
 * Оновлює лише документи у стані `draft` (проведений — 409). Повна заміна
 * шапки + рядків БЕЗ ефектів проведення (`updateStockDoc`); облікові рухи —
 * ЛИШЕ при проведенні (`/[id]/post`). Тіло — те саме, що й POST (`draft:true`
 * ігнорується схемою). Ролі — як у POST (створення).
 */

const WRITE_ROLES = ["manager", "admin", "owner", "warehouse"] as const;
const REPACK_ROLES = ["warehouse", "admin", "owner"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isStockDocKind(kind))
    return NextResponse.json({ error: "Невідомий тип" }, { status: 404 });
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const writeAllowed =
    kind === "repackings"
      ? (REPACK_ROLES as readonly string[])
      : (WRITE_ROLES as readonly string[]);
  if (!writeAllowed.includes(user.role))
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });

  const status = await getStockDocStatus(kind, id);
  if (status === null)
    return NextResponse.json(
      { error: "Документ не знайдено" },
      { status: 404 },
    );
  if (status !== "draft")
    return NextResponse.json(
      { error: "Документ проведено — редагування заборонено" },
      { status: 409 },
    );

  const body = await req.json().catch(() => null);
  const parsed = parseCreateBody(kind, body, user.id);
  if (!parsed.ok)
    return NextResponse.json(
      { error: "Невірні дані", issues: parsed.issues },
      { status: 400 },
    );

  try {
    const updated = await updateStockDoc(kind, id, parsed.data);
    return NextResponse.json({ id: updated.id });
  } catch (err) {
    console.error("[L-TEX] Stock doc draft update failed", {
      kind,
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка збереження чернетки" },
      { status: 500 },
    );
  }
}
