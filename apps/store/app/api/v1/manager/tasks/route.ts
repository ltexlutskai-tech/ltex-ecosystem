import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { createTaskSchema } from "@/lib/validations/task";

/**
 * POST /api/v1/manager/tasks — створити доручення (будь-хто → будь-кому).
 * Виконавець — конкретний користувач (assigneeUserId) АБО роль (assigneeRole).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Невірні дані" },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Якщо вказано конкретного виконавця — має існувати й бути активним.
  if (d.assigneeUserId) {
    const assignee = await prisma.user.findUnique({
      where: { id: d.assigneeUserId },
      select: { id: true, isActive: true },
    });
    if (!assignee || !assignee.isActive) {
      return NextResponse.json(
        { error: "Виконавця не знайдено" },
        { status: 400 },
      );
    }
  }

  const created = await prisma.task.create({
    data: {
      title: d.title,
      description: d.description?.trim() || null,
      createdByUserId: user.id,
      assigneeUserId: d.assigneeUserId ?? null,
      assigneeRole: d.assigneeUserId ? null : (d.assigneeRole ?? null),
      type: "manual",
      status: "open",
      clientId: d.clientId ?? null,
      saleId: d.saleId ?? null,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
