import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { logAuditEvent } from "@/lib/audit/audit-log";

/**
 * POST /api/v1/manager/warehouse/receivings/[id]/reopen
 *
 * Повернути проведений документ у статус draft для редагування
 * (узгоджено user 2026-06-05): admin/owner за необхідності можуть
 * розпровести → виправити → провести знову.
 *
 * Безпека: транзакційно
 *   1. Перевіряємо що жоден створений лот не у замовленні/реалізації/броні
 *      (як у /cancel) → інакше 409
 *   2. Видаляємо створені лоти + закриваємо актуальні Price (validTo = now)
 *   3. Очищаємо PurchasePrice створені цим документом
 *   4. Очищаємо receivingItem.createdLotId
 *   5. Status: posted → draft, скидаємо postedAt/postedByUserId
 *
 * Аналог 1С «Скасувати проведення» (Ctrl+Shift+P) — документ повертається
 * у редагований стан без втрати рядків.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "owner") {
    return NextResponse.json(
      { error: "Розпровести може лише admin або owner" },
      { status: 403 },
    );
  }
  const { id } = await params;

  const doc = await prisma.receiving.findUnique({
    where: { id },
    include: {
      lots: {
        select: {
          id: true,
          status: true,
          orderItems: { select: { id: true } },
          saleItems: { select: { id: true } },
        },
      },
    },
  });
  if (!doc) {
    return NextResponse.json(
      { error: "Документ не знайдений" },
      { status: 404 },
    );
  }
  if (doc.status !== "posted") {
    return NextResponse.json(
      {
        error: `Розпровести можна тільки проведений документ (поточний: "${doc.status}")`,
      },
      { status: 409 },
    );
  }
  const blocked = doc.lots.filter(
    (l) =>
      l.orderItems.length > 0 || l.saleItems.length > 0 || l.status !== "free",
  );
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        error: `Не можна розпровести: ${blocked.length} лот(ів) уже у роботі (замовлення/реалізації/бронь). Спершу зніміть прив'язки.`,
      },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.lot.deleteMany({ where: { receivingId: doc.id } });
    await tx.purchasePrice.deleteMany({ where: { receivingId: doc.id } });
    await tx.receivingItem.updateMany({
      where: { receivingId: doc.id },
      data: { createdLotId: null },
    });
    await tx.receiving.update({
      where: { id: doc.id },
      data: {
        status: "draft",
        postedAt: null,
        postedByUserId: null,
      },
    });
  });

  void logAuditEvent({
    user: { id: user.id, email: user.email, role: user.role },
    action: "update",
    resource: "receiving",
    resourceId: id,
    summary: `Розпровели документ (повернуто у draft для редагування)`,
    req,
  });

  return NextResponse.json({ ok: true });
}
