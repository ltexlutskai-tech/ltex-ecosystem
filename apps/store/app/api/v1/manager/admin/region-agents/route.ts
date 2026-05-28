import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { createRegionAgentSchema } from "@/lib/validations/manager-region-agents";
import { getRegionLabel } from "@/lib/constants/regions";

/**
 * Чат-inbox Phase 2 — адмін-CRUD мапи `MgrRegionAgent`
 * (область → торговий). Лише admin.
 *
 * GET — повний список з join до User (для UI таблиці).
 * POST — створити запис (унікально по region; conflict → 409).
 */

export async function GET(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const items = await prisma.mgrRegionAgent.findMany({
    orderBy: { region: "asc" },
    select: {
      id: true,
      region: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  return NextResponse.json({
    items: items.map((it) => ({
      id: it.id,
      region: it.region,
      regionLabel: getRegionLabel(it.region) ?? it.region,
      userId: it.userId,
      userFullName: it.user.fullName,
      userEmail: it.user.email,
      userRole: it.user.role,
      createdAt: it.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireRole(["admin"], req);
  if (!admin) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createRegionAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  // Перевірка, що user існує + активний.
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: "Менеджера не знайдено або деактивовано" },
      { status: 400 },
    );
  }

  try {
    const created = await prisma.mgrRegionAgent.create({
      data: { region: parsed.data.region, userId: parsed.data.userId },
      select: { id: true, region: true, userId: true },
    });
    return NextResponse.json(
      {
        id: created.id,
        region: created.region,
        regionLabel: getRegionLabel(created.region) ?? created.region,
        userId: created.userId,
      },
      { status: 201 },
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Для цієї області вже призначений менеджер" },
        { status: 409 },
      );
    }
    throw err;
  }
}
