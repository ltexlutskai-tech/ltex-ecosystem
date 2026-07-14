import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser, requireRole } from "@/lib/auth/manager-auth";
import { createPaymentRequisiteSchema } from "@/lib/validations/mgr-payment-requisite";

/**
 * Довідник реквізитів для оплати (`MgrPaymentRequisite`).
 * GET — доступний будь-якому менеджеру (форма реалізації показує селектор).
 * POST — лише owner/admin.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const items = await prisma.mgrPaymentRequisite.findMany({
    where: { archived: false },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPaymentRequisiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 3),
      },
      { status: 400 },
    );
  }
  const d = parsed.data;

  // Один дефолт: якщо новий позначено дефолтним — знімаємо прапор з інших.
  if (d.isDefault) {
    await prisma.mgrPaymentRequisite.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.mgrPaymentRequisite.create({
    data: {
      name: d.name,
      recipient: d.recipient,
      edrpou: d.edrpou ?? null,
      bankName: d.bankName ?? null,
      iban: d.iban ?? null,
      purpose: d.purpose?.trim() || "Оплата товару",
      isDefault: d.isDefault ?? false,
      sortOrder: d.sortOrder ?? 0,
    },
  });
  revalidatePath("/manager/payment-requisites");
  return NextResponse.json(created, { status: 201 });
}
