import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { updatePaymentRequisiteSchema } from "@/lib/validations/mgr-payment-requisite";

/** Реквізити для оплати — редагування/видалення (owner/admin). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.mgrPaymentRequisite.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updatePaymentRequisiteSchema.safeParse(body);
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

  // Один дефолт на весь довідник.
  if (d.isDefault) {
    await prisma.mgrPaymentRequisite.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.mgrPaymentRequisite.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.recipient !== undefined ? { recipient: d.recipient } : {}),
      ...(d.edrpou !== undefined ? { edrpou: d.edrpou ?? null } : {}),
      ...(d.bankName !== undefined ? { bankName: d.bankName ?? null } : {}),
      ...(d.iban !== undefined ? { iban: d.iban ?? null } : {}),
      ...(d.purpose !== undefined
        ? { purpose: d.purpose?.trim() || "Оплата товару" }
        : {}),
      ...(d.isDefault !== undefined ? { isDefault: d.isDefault } : {}),
      ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
      ...(d.archived !== undefined ? { archived: d.archived } : {}),
    },
  });
  revalidatePath("/manager/payment-requisites");
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireRole(["admin", "owner"], req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.mgrPaymentRequisite.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  await prisma.mgrPaymentRequisite.delete({ where: { id } });
  revalidatePath("/manager/payment-requisites");
  return NextResponse.json({ ok: true });
}
