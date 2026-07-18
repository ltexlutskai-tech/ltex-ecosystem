import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { patchTaskSchema } from "@/lib/validations/task";
import { isAssignee } from "@/lib/manager/task-types";

/**
 * PATCH /api/v1/manager/tasks/[id]
 * - complete: виконавець (особисто або за роллю) закриває + коментар-результат;
 * - reopen: постановник знову відкриває.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = patchTaskSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }

  if (parsed.data.action === "complete") {
    const canComplete = isAssignee(
      { assigneeUserId: task.assigneeUserId, assigneeRole: task.assigneeRole },
      { id: user.id, role: user.role },
    );
    if (!canComplete) {
      return NextResponse.json(
        { error: "Закрити завдання може лише виконавець" },
        { status: 403 },
      );
    }
    await prisma.task.update({
      where: { id },
      data: {
        status: "done",
        completedAt: new Date(),
        completedByUserId: user.id,
        resultComment: parsed.data.resultComment?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // reopen — лише постановник.
  if (task.createdByUserId !== user.id) {
    return NextResponse.json(
      { error: "Перевідкрити може лише постановник" },
      { status: 403 },
    );
  }
  await prisma.task.update({
    where: { id },
    data: { status: "open", completedAt: null, completedByUserId: null },
  });
  return NextResponse.json({ ok: true });
}
