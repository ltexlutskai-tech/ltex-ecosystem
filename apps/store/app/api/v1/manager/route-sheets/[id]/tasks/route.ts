import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { isRouteSheetLocked } from "@/lib/manager/route-sheet-status";
import { addTaskSchema } from "@/lib/validations/manager-route-sheet";

/**
 * Завдання маршрутного листа (Етап 4) — вільні нотатки «клієнт + коментар».
 * Без автоматики (аудит §D). Блокується, коли МЛ завершено (lock).
 */

/** Перевіряє, що МЛ існує і не завершено (lock). Повертає NextResponse | null. */
async function guardEditable(id: string): Promise<NextResponse | null> {
  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!sheet) {
    return NextResponse.json(
      { error: "Маршрутний лист не знайдено" },
      { status: 404 },
    );
  }
  if (isRouteSheetLocked(sheet.status)) {
    return NextResponse.json(
      { error: "Маршрутний лист завершено — редагування заборонено" },
      { status: 409 },
    );
  }
  return null;
}

/** POST — додати завдання. Body: `{ customerId?, comment }`. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const guard = await guardEditable(id);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const parsed = addTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const task = await prisma.routeSheetTask.create({
    data: {
      routeSheetId: id,
      customerId: parsed.data.customerId ?? null,
      comment: parsed.data.comment,
    },
  });

  // Клієнт обирається з менеджерського довідника (MgrClient); резолвимо ім'я
  // для відображення (плоский скаляр у RouteSheetTask, без relation).
  const client = task.customerId
    ? await prisma.mgrClient.findUnique({
        where: { id: task.customerId },
        select: { name: true, phonePrimary: true, city: true },
      })
    : null;

  return NextResponse.json({
    task: {
      id: task.id,
      customerId: task.customerId,
      customerName: client?.name ?? null,
      customerPhone: client?.phonePrimary ?? null,
      customerCity: client?.city ?? null,
      comment: task.comment,
    },
  });
}

/** DELETE — прибрати завдання. Query: `?taskId=`. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const guard = await guardEditable(id);
  if (guard) return guard;

  const taskId = new URL(req.url).searchParams.get("taskId")?.trim() ?? "";
  if (!taskId) {
    return NextResponse.json({ error: "Не вказано taskId" }, { status: 400 });
  }

  // deleteMany — щоб уникнути 500 на неіснуючому/чужому taskId (count=0 ⇒ ok).
  const result = await prisma.routeSheetTask.deleteMany({
    where: { id: taskId, routeSheetId: id },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
