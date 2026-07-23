import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { completeVideoTask } from "@/lib/manager/video-task";

/**
 * POST /api/v1/manager/video-tasks/[id]/done
 *
 * «Готово»: пише характеристики у товар/лот, бронює лот на клієнта+менеджера до
 * 23:59 наступного дня, ставить завдання `done` і надсилає менеджеру
 * інтерактивне нагадування «відео готове». Гейт: відеозона / admin / owner.
 * Вимагає наявного мішка (лот) + сформованого YouTube-опису.
 */

const FILM_ROLES = ["videozone", "admin", "owner"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!FILM_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await completeVideoTask({ taskId: id, actorUserId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TASK_NOT_FOUND") {
      return NextResponse.json(
        { error: "Завдання не знайдено" },
        { status: 404 },
      );
    }
    if (msg === "NO_LOT") {
      return NextResponse.json(
        { error: "Мішок ще не принесено" },
        { status: 409 },
      );
    }
    if (msg === "NO_DESCRIPTION") {
      return NextResponse.json(
        { error: "Спершу сформуйте YouTube-опис" },
        { status: 409 },
      );
    }
    console.error("[L-TEX] complete video task failed", { error: msg });
    return NextResponse.json(
      { error: "Не вдалося завершити завдання" },
      { status: 500 },
    );
  }
}
