import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { postReceiving, ReceivingError } from "@/lib/warehouse/post-receiving";
import { completeReceivingReviewReminders } from "@/lib/warehouse/review-reminders";

/**
 * POST /api/v1/manager/warehouse/receivings/[id]/post
 *
 * Проведення документа — ТІЛЬКИ admin/owner (узгоджено з user 2026-06-04):
 * warehouse зберігає чернетку, admin/owner перевіряє і проводить
 * (аналогічно як у 1С: «Зберегти» vs «Записати і провести»).
 *
 * Транзакційно створює лоти + апдейт балансу. Аналог 1С
 * `ОбработкаПроведения` документа `ПоступленняТоварівУслуг`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "owner") {
    return NextResponse.json(
      { error: "Проводити документ може лише admin або owner" },
      { status: 403 },
    );
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
    // Завершити нагадування про перевірку (fire-and-forget)
    void completeReceivingReviewReminders(id).catch(() => {});
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
