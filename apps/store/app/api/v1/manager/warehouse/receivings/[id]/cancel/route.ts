import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { logAuditEvent } from "@/lib/audit/audit-log";
import {
  cancelPostedReceiving,
  ReceivingError,
} from "@/lib/warehouse/post-receiving";
import { receivingCancelSchema } from "@/lib/warehouse/validations";
import { completeReceivingReviewReminders } from "@/lib/warehouse/review-reminders";

/**
 * POST /api/v1/manager/warehouse/receivings/[id]/cancel
 *
 * Скасування проведеного документа. Тільки admin/owner — узгоджено з user
 * 2026-06-03 (питання 5, А). Видаляє створені лоти + ставить cancelled.
 * Якщо хоч один лот уже у замовленні/реалізації — 409 (треба спершу зняти).
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
      { error: "Скасовувати проведений документ може лише admin або owner" },
      { status: 403 },
    );
  }
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = receivingCancelSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Вкажіть причину скасування",
        issues: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  try {
    await cancelPostedReceiving(id, user.id, parsed.data.reason);
    void logAuditEvent({
      user: { id: user.id, email: user.email, role: user.role },
      action: "update",
      resource: "receiving",
      resourceId: id,
      summary: `Скасовано проведений документ: ${parsed.data.reason}`,
      req,
    });
    void completeReceivingReviewReminders(id).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReceivingError) {
      const status =
        err.code === "not_found"
          ? 404
          : err.code === "invalid_status" || err.code === "lots_in_use"
            ? 409
            : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status },
      );
    }
    console.error("[L-TEX] cancelPostedReceiving failed", {
      receivingId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Не вдалося скасувати документ" },
      { status: 500 },
    );
  }
}
