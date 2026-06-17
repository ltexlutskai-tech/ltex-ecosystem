import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { createTradeAgentSchema } from "@/lib/validations/mgr-dictionaries";

/**
 * Фаза 1 (5.6) — адмін-CRUD довідника торгових агентів
 * (← 1С Catalog.ТорговыеАгенты). Опційно зв'язується з User. Гард admin|owner.
 *
 * GET — список агентів + активні користувачі (для FK-селектора). POST — створити.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const [items, users] = await Promise.all([
    prisma.mgrTradeAgent.findMany({
      orderBy: [{ archived: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        userId: true,
        archived: true,
        user: { select: { id: true, fullName: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);
  return NextResponse.json({ items, users });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createTradeAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }

  const created = await prisma.mgrTradeAgent.create({
    data: {
      name: parsed.data.name,
      code: parsed.data.code ?? null,
      userId: parsed.data.userId ?? null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      userId: true,
      archived: true,
      user: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(created, { status: 201 });
}
