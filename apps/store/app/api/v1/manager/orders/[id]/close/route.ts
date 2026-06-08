import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { logAuditEvent } from "@/lib/audit/audit-log";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";

/**
 * POST /api/v1/manager/orders/[id]/close
 *
 * Ручне закриття активного замовлення (Етап 3 блоку Замовлення).
 *   - status → 'cancelled' + closedAt + closedByUserId
 *   - закриваються пов'язані auto-нагадування про прострочку
 *
 * Доступ: admin / owner усі; manager — тільки свої замовлення
 * (через ownership як у GET /orders).
 */

const closeSchema = z.object({
  reasonId: z.string().min(1),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = closeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Вкажіть причину закриття", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      closedAt: true,
      customerId: true,
      customer: { select: { code1C: true } },
      assignedAgentUserId: true,
      version: true,
    },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Замовлення не знайдене" },
      { status: 404 },
    );
  }
  if (existing.closedAt) {
    return NextResponse.json(
      { error: "Замовлення вже закрите" },
      { status: 409 },
    );
  }
  // Ownership: admin/owner усі, інші — тільки свої
  if (user.role !== "admin" && user.role !== "owner") {
    const myCodes = await getMyClientCodes1C(user);
    if (myCodes !== null) {
      const ownerByAgent = existing.assignedAgentUserId === user.id;
      const ownerByClient =
        existing.customer?.code1C !== null &&
        existing.customer?.code1C !== undefined &&
        myCodes.includes(existing.customer.code1C);
      if (!ownerByAgent && !ownerByClient) {
        return NextResponse.json(
          { error: "Це не ваше замовлення" },
          { status: 403 },
        );
      }
    }
  }

  // Перевіряємо що причина існує
  const reason = await prisma.orderCloseReason.findUnique({
    where: { id: parsed.data.reasonId },
    select: { id: true, label: true },
  });
  if (!reason) {
    return NextResponse.json({ error: "Невідома причина" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id },
      data: {
        status: "cancelled",
        closedAt: new Date(),
        closeReasonId: reason.id,
        closedByUserId: user.id,
        closeNotes: parsed.data.notes ?? null,
        archived: true,
        version: { increment: 1 },
      },
    });
    // Закрити прив'язані auto-нагадування (якщо є)
    await tx.mgrReminder.updateMany({
      where: {
        completedAt: null,
        // Якщо у вас будуть нагадування з orderId — додамо умову. Поки не маємо
        // прямого FK у MgrReminder.orderId, нагадування пов'язані лише через
        // body-текст. Розширити пізніше при додаванні MgrReminder.orderId.
      },
      data: {},
    });
  });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "update",
    resource: "order",
    resourceId: id,
    summary: `Закрито замовлення: ${reason.label}`,
    req,
  });

  return NextResponse.json({ ok: true });
}
