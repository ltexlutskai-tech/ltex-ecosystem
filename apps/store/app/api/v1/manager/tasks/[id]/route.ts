import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { patchTaskSchema } from "@/lib/validations/task";
import { isAssignee } from "@/lib/manager/task-types";

/** admin/owner мають повний доступ до вилучення/архівування. */
function isAdminOwner(role: string): boolean {
  return role === "admin" || role === "owner";
}

/**
 * PATCH /api/v1/manager/tasks/[id]
 * - complete: виконавець (особисто або за роллю) закриває + коментар-результат;
 * - reopen: постановник знову відкриває;
 * - archive: виконавець АБО постановник АБО admin/owner → у архів;
 * - unarchive: той самий набір → повернути з архіву.
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

  // Хто причетний до завдання: виконавець, постановник або admin/owner.
  const mine = isAssignee(
    { assigneeUserId: task.assigneeUserId, assigneeRole: task.assigneeRole },
    { id: user.id, role: user.role },
  );
  const iCreated = task.createdByUserId === user.id;
  const involved = mine || iCreated || isAdminOwner(user.role);

  if (parsed.data.action === "archive") {
    if (!involved) {
      return NextResponse.json(
        { error: "Архівувати може виконавець, постановник або адміністратор" },
        { status: 403 },
      );
    }
    await prisma.task.update({
      where: { id },
      data: {
        status: "archived",
        archivedAt: new Date(),
        archivedByUserId: user.id,
        archivedByName: user.fullName,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "unarchive") {
    if (!involved) {
      return NextResponse.json(
        { error: "Відновити може виконавець, постановник або адміністратор" },
        { status: 403 },
      );
    }
    await prisma.task.update({
      where: { id },
      data: {
        status: "open",
        archivedAt: null,
        archivedByUserId: null,
        archivedByName: null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // reopen — лише постановник.
  if (!iCreated) {
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

/**
 * DELETE /api/v1/manager/tasks/[id] — hard-delete ручного завдання.
 * Дозволено лише постановнику або admin/owner (зникає для всіх).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || task.type !== "manual") {
    return NextResponse.json(
      { error: "Завдання не знайдено" },
      { status: 404 },
    );
  }

  const canDelete = task.createdByUserId === user.id || isAdminOwner(user.role);
  if (!canDelete) {
    return NextResponse.json(
      { error: "Вилучити завдання може лише постановник" },
      { status: 403 },
    );
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
