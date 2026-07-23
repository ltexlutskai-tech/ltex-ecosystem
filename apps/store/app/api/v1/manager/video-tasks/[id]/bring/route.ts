import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { addBagSchema } from "@/lib/validations/video-task";
import { addVideoTaskBag } from "@/lib/manager/video-task";

/**
 * POST /api/v1/manager/video-tasks/[id]/bring
 *
 * Склад сканує черговий мішок (ШК) → додає його у завдання й одразу бронює лот
 * на клієнта. Повертає ШК доданого мішка. Гейт: склад / admin / owner.
 */

const BRING_ROLES = ["warehouse", "admin", "owner"];

const ERR_STATUS: Record<string, { code: number; msg: string }> = {
  TASK_NOT_FOUND: { code: 404, msg: "Завдання не знайдено" },
  NOT_COLLECTING: { code: 409, msg: "Мішки вже передано у відеозону" },
  ENOUGH_BAGS: { code: 409, msg: "Відскановано потрібну кількість мішків" },
  LOT_NOT_FOUND: { code: 404, msg: "Мішок не знайдено" },
  WRONG_PRODUCT: { code: 409, msg: "Цей мішок належить іншому товару" },
  ALREADY_ADDED: { code: 409, msg: "Цей мішок уже додано" },
  RESERVED: { code: 409, msg: "Мішок заброньовано" },
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!BRING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = addBagSchema.safeParse(body ?? {});
  if (!parsed.success || (!parsed.data.barcode && !parsed.data.lotId)) {
    return NextResponse.json(
      { error: "Відскануйте штрихкод мішка" },
      { status: 400 },
    );
  }

  try {
    const res = await addVideoTaskBag({
      taskId: id,
      barcode: parsed.data.barcode ?? null,
      lotId: parsed.data.lotId ?? null,
      actor: { id: user.id, fullName: user.fullName },
    });
    return NextResponse.json({ ok: true, barcode: res.barcode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const known = ERR_STATUS[msg];
    if (known) {
      return NextResponse.json({ error: known.msg }, { status: known.code });
    }
    console.error("[L-TEX] add video bag failed", { error: msg });
    return NextResponse.json({ error: "Не вдалося" }, { status: 500 });
  }
}
