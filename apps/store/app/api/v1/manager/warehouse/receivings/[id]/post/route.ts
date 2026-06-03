import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEdit } from "@/lib/permissions/role-permissions";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { postReceiving, ReceivingError } from "@/lib/warehouse/post-receiving";

/**
 * POST /api/v1/manager/warehouse/receivings/[id]/post
 *
 * Проводить документ → транзакційно створює лоти + апдейт балансу складу.
 * Тільки якщо документ у статусі `draft` і має хоча б 1 рядок.
 * Аналог 1С `ОбработкаПроведения` для `ПоступленняТоварівУслуг`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canEdit({ role: user.role }, "receivings")) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;

  try {
    const result = await postReceiving(id, user.id);
    void logAuditEvent({
      user: { id: user.id, email: user.email, role: user.role },
      action: "post",
      resource: "receiving",
      resourceId: id,
      summary: `Проведено поступлення: створено ${result.lotsCreated} лотів, вага ${result.totalWeight} кг`,
      dataAfter: { ...result },
      req,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ReceivingError) {
      const status =
        err.code === "not_found"
          ? 404
          : err.code === "invalid_status"
            ? 409
            : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status },
      );
    }
    console.error("[L-TEX] postReceiving failed", {
      receivingId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Не вдалося провести документ" },
      { status: 500 },
    );
  }
}
