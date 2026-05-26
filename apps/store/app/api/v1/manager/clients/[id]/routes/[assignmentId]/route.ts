import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientRouteReorderSchema } from "@/lib/validations/mgr-client";

/**
 * PATCH — змінює порядок призначеного маршруту (owner/assigned/admin).
 * `direction: "up" | "down"` — міняє місцями `sortOrder` із сусіднім.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, assignmentId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientRouteReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const current = await prisma.mgrClientRouteAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, clientId: true, sortOrder: true },
  });
  if (!current || current.clientId !== id) {
    return NextResponse.json(
      { error: "Призначення не знайдено" },
      { status: 404 },
    );
  }

  const direction = parsed.data.direction;
  // Шукаємо сусіда: для "up" — найбільший sortOrder менший за поточний,
  // для "down" — найменший sortOrder більший за поточний.
  const neighbour = await prisma.mgrClientRouteAssignment.findFirst({
    where: {
      clientId: id,
      sortOrder:
        direction === "up"
          ? { lt: current.sortOrder }
          : { gt: current.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });

  // Уже скраю — нічого не робимо (no-op, але 200).
  if (!neighbour) {
    return NextResponse.json({ ok: true, moved: false });
  }

  await prisma.$transaction([
    prisma.mgrClientRouteAssignment.update({
      where: { id: current.id },
      data: { sortOrder: neighbour.sortOrder },
    }),
    prisma.mgrClientRouteAssignment.update({
      where: { id: neighbour.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);

  return NextResponse.json({ ok: true, moved: true });
}

/** DELETE — прибирає призначення маршруту (owner/assigned/admin). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id, assignmentId } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const existing = await prisma.mgrClientRouteAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== id) {
    return NextResponse.json(
      { error: "Призначення не знайдено" },
      { status: 404 },
    );
  }

  await prisma.mgrClientRouteAssignment.delete({
    where: { id: assignmentId },
  });

  return NextResponse.json({ ok: true });
}
