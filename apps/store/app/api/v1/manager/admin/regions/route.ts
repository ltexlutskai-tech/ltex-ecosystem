import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { createRegionSchema } from "@/lib/validations/mgr-dictionaries";

/**
 * Фаза 1 (5.6) — адмін-CRUD довідника областей (← 1С Catalog.Области).
 * Гард admin|owner. GET — список (з архівними); POST — створити.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const items = await prisma.region.findMany({
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, archived: true },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createRegionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const created = await prisma.region.create({
    data: { name: parsed.data.name, code: parsed.data.code ?? null },
    select: { id: true, code: true, name: true, archived: true },
  });
  return NextResponse.json(created, { status: 201 });
}
