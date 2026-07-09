import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  applyBagStateChange,
  isBeforeToday,
} from "@/lib/manager/bag-state-hooks";
import { BAG_STATE_WRITE_ROLES } from "@/lib/manager/bag-state-roles";

/**
 * POST /api/v1/manager/bag-state-changes/[id]/post — провести документ.
 *
 * Записує стан у лоти + журнал історії + тригери відео-нагадувань. Гард
 * «сьогоднішній документ» — пом'якшений (виняток для admin/owner). При помилці
 * резолву мішків документ лишається у `draft` (applyBagStateChange кидає до
 * зміни статусу).
 */

const ELEVATED_ROLES = ["admin", "owner"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!(BAG_STATE_WRITE_ROLES as readonly string[]).includes(user.role)) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;
  const doc = await prisma.bagStateChange.findUnique({
    where: { id },
    select: { id: true, status: true, docDate: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (doc.status === "posted") {
    return NextResponse.json({ error: "already_posted" }, { status: 409 });
  }
  if (
    isBeforeToday(doc.docDate) &&
    !(ELEVATED_ROLES as readonly string[]).includes(user.role)
  ) {
    return NextResponse.json(
      { error: "Можна проводити лише сьогоднішній документ" },
      { status: 409 },
    );
  }

  try {
    const result = await applyBagStateChange(id, user.id);
    return NextResponse.json({
      ok: true,
      itemsUpdated: result.itemsUpdated,
      videoRemindersCreated: result.videoRemindersCreated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "post_failed";
    // Мішок за ШК не знайдено → 409 з переліком ШК для UI.
    if (message.startsWith("bag_not_found:")) {
      return NextResponse.json(
        {
          error: "Мішок за ШК не знайдено",
          missingBarcodes: message.slice("bag_not_found:".length).split(","),
        },
        { status: 409 },
      );
    }
    const status = message === "bag_state_not_found" ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
