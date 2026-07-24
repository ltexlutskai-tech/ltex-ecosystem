import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * DELETE /api/v1/manager/warehouse-tasks/[id] — вилучити складське завдання
 * («Відправлення»). Завдання створюється автоматично при проведенні
 * реалізації, тож «створив» його менеджер реалізації (`managerUserId`) —
 * вилучати може лише він або admin/owner (рішення user 2026-07-24).
 *
 * Видаляє лише саме завдання (позиції/місця — каскадом); реалізацію та рухи
 * не чіпаємо. Якщо реалізацію перепровести — завдання створиться знову.
 */

const ADMIN_ROLES = ["admin", "owner"];

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    select: { id: true, managerUserId: true },
  });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }

  const canDelete =
    ADMIN_ROLES.includes(user.role) ||
    (task.managerUserId != null && task.managerUserId === user.id);
  if (!canDelete) {
    return NextResponse.json(
      {
        error:
          "Вилучити завдання може лише менеджер, що його створив, або адміністратор",
      },
      { status: 403 },
    );
  }

  await prisma.warehouseTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
