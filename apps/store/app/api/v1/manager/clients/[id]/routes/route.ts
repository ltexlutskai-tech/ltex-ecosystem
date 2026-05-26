import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canEditClient } from "@/lib/permissions/mgr-client-edit";
import { mgrClientRouteCreateSchema } from "@/lib/validations/mgr-client";

function serializeAssignment(a: {
  id: string;
  routeId: string;
  sortOrder: number;
  route: { name: string; isActive: boolean };
}) {
  return {
    id: a.id,
    routeId: a.routeId,
    name: a.route.name,
    isActive: a.route.isActive,
    sortOrder: a.sortOrder,
  };
}

/**
 * POST — призначає клієнту маршрут (owner/assigned/admin).
 * Дедуплікація: якщо маршрут уже призначений → 409. sortOrder = max + 1.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const allowed = await canEditClient(user, id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Недостатньо прав для редагування цього клієнта" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = mgrClientRouteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const route = await prisma.mgrRoute.findUnique({
    where: { id: parsed.data.routeId },
    select: { id: true },
  });
  if (!route) {
    return NextResponse.json({ error: "Маршрут не знайдено" }, { status: 404 });
  }

  const existing = await prisma.mgrClientRouteAssignment.findUnique({
    where: { clientId_routeId: { clientId: id, routeId: parsed.data.routeId } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Маршрут уже призначено цьому клієнту" },
      { status: 409 },
    );
  }

  const max = await prisma.mgrClientRouteAssignment.aggregate({
    where: { clientId: id },
    _max: { sortOrder: true },
  });
  const nextSort = (max._max.sortOrder ?? -1) + 1;

  try {
    const created = await prisma.mgrClientRouteAssignment.create({
      data: {
        clientId: id,
        routeId: parsed.data.routeId,
        sortOrder: nextSort,
      },
      include: { route: { select: { name: true, isActive: true } } },
    });
    return NextResponse.json(
      { route: serializeAssignment(created) },
      { status: 201 },
    );
  } catch (err) {
    // Гонка двох одночасних запитів — unique([clientId, routeId]).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Маршрут уже призначено цьому клієнту" },
        { status: 409 },
      );
    }
    throw err;
  }
}
