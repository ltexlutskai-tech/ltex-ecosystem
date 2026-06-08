import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/orders/close-reasons
 * POST /api/v1/manager/orders/close-reasons (admin/owner)
 *
 * Довідник причин закриття замовлень (Етап 3 блоку Замовлення).
 * Дефолтні причини засіяні міграцією: клієнт відмовив / товару немає /
 * товар вже проданий / висить надто довго / інше.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const reasons = await prisma.orderCloseReason.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, code: true, label: true },
  });
  return NextResponse.json({ items: reasons });
}

const createSchema = z.object({
  code: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().default(50),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "owner") {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }
  const existing = await prisma.orderCloseReason.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) {
    return NextResponse.json({ reason: existing });
  }
  const created = await prisma.orderCloseReason.create({ data: parsed.data });
  return NextResponse.json({ reason: created }, { status: 201 });
}
