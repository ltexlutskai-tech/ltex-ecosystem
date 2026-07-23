import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { patchVideoTaskSchema } from "@/lib/validations/video-task";

/**
 * GET  /api/v1/manager/video-tasks/[id] — картка завдання (усі поля).
 * PATCH /api/v1/manager/video-tasks/[id] — відеозона зберігає чернетку
 *   характеристик + посилання на відео (доступно у статусі `filming`).
 *
 * Гейт PATCH: відеозона / admin / owner. GET — будь-який залогінений (картку
 * бачать і менеджер-замовник, і склад).
 */

const FILM_ROLES = ["videozone", "admin", "owner"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id } = await params;
  const task = await prisma.mgrVideoTask.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  return NextResponse.json({ task });
}

export async function PATCH(
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
  const body = await req.json().catch(() => null);
  const parsed = patchVideoTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const task = await prisma.mgrVideoTask.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }
  if (task.status === "done" || task.status === "cancelled") {
    return NextResponse.json(
      { error: "Завдання вже завершено" },
      { status: 409 },
    );
  }

  const d = parsed.data;
  const updated = await prisma.mgrVideoTask.update({
    where: { id },
    data: {
      season: d.season ?? undefined,
      quality: d.quality ?? undefined,
      gender: d.gender ?? undefined,
      sizes: d.sizes ?? undefined,
      quantity: d.quantity ?? undefined,
      // Прикріпив виконавця (відеозона), якщо ще не задано.
      assignedUserId: user.id,
      assignedName: user.fullName,
    },
  });
  return NextResponse.json({ task: updated });
}
