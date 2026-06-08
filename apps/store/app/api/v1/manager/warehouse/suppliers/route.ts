import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canView } from "@/lib/permissions/role-permissions";
import { logAuditEvent } from "@/lib/audit/audit-log";

/**
 * Постачальники (← Тиждень 2 блоку Поступлення).
 * GET — список з пошуком, POST — створити нового.
 *
 * Доступ: warehouse / admin / owner / bookkeeper (через матрицю).
 */

const supplierCreateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  fullName: z.string().trim().max(300).optional().nullable(),
  edrpou: z.string().trim().max(50).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  bankAccount: z.string().trim().max(100).optional().nullable(),
  currency: z.string().trim().length(3).default("EUR"),
  comment: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  // suppliers — ресурс не у матриці; перевіряємо через receivings/finance.
  // Доступ до списку постачальників мають усі ролі що бачать receivings або finance.
  const viewReceivings = canView({ role: user.role }, "receivings");
  const viewFinance = canView({ role: user.role }, "finance");
  if (!viewReceivings.allowed && !viewFinance.allowed) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  const where: Record<string, unknown> = {};
  if (!includeInactive) where.isActive = true;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { edrpou: { contains: q, mode: "insensitive" } },
    ];
  }

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: 100,
    select: {
      id: true,
      code1C: true,
      name: true,
      fullName: true,
      edrpou: true,
      phone: true,
      email: true,
      country: true,
      currency: true,
      isActive: true,
    },
  });
  return NextResponse.json({ items: suppliers });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  // Створювати постачальників можуть admin/owner/warehouse (зазвичай warehouse при першому поступленні).
  if (
    user.role !== "admin" &&
    user.role !== "owner" &&
    user.role !== "warehouse"
  ) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = supplierCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const created = await prisma.supplier.create({
    data: { ...parsed.data, isActive: true },
    select: {
      id: true,
      name: true,
      currency: true,
      isActive: true,
    },
  });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "create",
    resource: "supplier",
    resourceId: created.id,
    summary: `Додано постачальника: ${created.name}`,
    dataAfter: created,
    req,
  });

  return NextResponse.json({ supplier: created }, { status: 201 });
}
