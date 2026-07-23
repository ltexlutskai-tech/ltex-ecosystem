import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { advanceVideoTaskToFilming } from "@/lib/manager/video-task";

/**
 * POST /api/v1/manager/video-tasks/[id]/advance
 *
 * Склад завершив збирання мішків → завдання переходить у зйомку (`filming`).
 * Гейт: склад / admin / owner.
 */
const BRING_ROLES = ["warehouse", "admin", "owner"];

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
  try {
    await advanceVideoTaskToFilming(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TASK_NOT_FOUND") {
      return NextResponse.json(
        { error: "Завдання не знайдено" },
        { status: 404 },
      );
    }
    if (msg === "NOT_COLLECTING") {
      return NextResponse.json({ error: "Уже передано" }, { status: 409 });
    }
    if (msg === "NO_BAGS") {
      return NextResponse.json(
        { error: "Спершу відскануйте хоча б один мішок" },
        { status: 409 },
      );
    }
    console.error("[L-TEX] advance video task failed", { error: msg });
    return NextResponse.json({ error: "Не вдалося" }, { status: 500 });
  }
}
