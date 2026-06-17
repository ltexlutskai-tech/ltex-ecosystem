import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { createCitySchema } from "@/lib/validations/mgr-dictionaries";

/**
 * Фаза 1 (5.6) — адмін-CRUD довідника міст (← 1С Catalog.Города).
 * Місто належить області (regionId). Гард admin|owner.
 *
 * GET — список міст + довідник областей (для FK-селектора). POST — створити.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const [items, regions] = await Promise.all([
    prisma.cityy.findMany({
      orderBy: [{ archived: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        regionId: true,
        archived: true,
        region: { select: { id: true, name: true } },
      },
    }),
    prisma.region.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ items, regions });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createCitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const created = await prisma.cityy.create({
    data: {
      name: parsed.data.name,
      code: parsed.data.code ?? null,
      regionId: parsed.data.regionId ?? null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      regionId: true,
      archived: true,
      region: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(created, { status: 201 });
}
