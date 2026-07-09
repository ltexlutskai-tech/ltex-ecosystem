import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { createBagStateChange } from "@/lib/manager/bag-state";
import { createBagStateSchema } from "@/lib/validations/bag-state";

/**
 * Документ «Зміна стану мішка».
 *  GET  — список (усі менеджерські ролі бачать);
 *  POST — створення чернетки (лише склад + адмін/власник).
 */

export const BAG_STATE_WRITE_ROLES = ["warehouse", "admin", "owner"] as const;

function parseInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const page = parseInteger(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = parseInteger(url.searchParams.get("pageSize"), 30, 10, 100);

  const where: Prisma.BagStateChangeWhereInput = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { docNumber: { contains: q, mode: "insensitive" } },
      { number1C: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.bagStateChange.findMany({
      where,
      orderBy: { docDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        docNumber: true,
        number1C: true,
        docDate: true,
        status: true,
        notes: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.bagStateChange.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((d) => ({
      id: d.id,
      docNumber: d.docNumber,
      number1C: d.number1C,
      docDate: d.docDate.toISOString(),
      status: d.status,
      notes: d.notes,
      itemsCount: d._count.items,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!(BAG_STATE_WRITE_ROLES as readonly string[]).includes(user.role)) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createBagStateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const doc = await createBagStateChange(parsed.data, { userId: user.id });
  return NextResponse.json(
    { id: doc.id, docNumber: doc.docNumber },
    { status: 201 },
  );
}
