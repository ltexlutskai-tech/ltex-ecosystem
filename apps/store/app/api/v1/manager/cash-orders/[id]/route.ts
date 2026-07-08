import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canDeleteManagerDoc } from "@/lib/manager/doc-delete-permission";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import {
  recomputeDebtForClients,
  resolveClientIdByCustomer,
} from "@/lib/manager/debt-register";
import { deleteCashFlowMovementsForOrder } from "@/lib/manager/cashflow-register";

/**
 * Видалення касового ордера / оплати (з контекстного меню списку Оплати).
 *
 * Ownership: admin — будь-який ордер; manager — лише ордери своїх клієнтів
 * (через `Customer.code1C` платника, як у POST `/cash-orders`). Standalone-ордер
 * без платника (`customerId`/`saleId` обидва null) видаляє лише admin/owner.
 *
 * Реверс сліду документа в одній транзакції:
 *   - рух боргу проведеної оплати (`kind="payment"`, `sourceType="cash_order"`,
 *     `sourceId=cashOrderId`) видаляється → далі `MgrClient.debt` перераховується;
 *   - парний ордер-здача (`changeForId === id`) видаляється разом (інакше
 *     лишився б «висячий» розхід);
 *   - `MgrCashOrder.routeSheetId` — плоский скаляр (не FK), реальні документи МЛ
 *     не зачіпаємо.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!canDeleteManagerDoc(user.role)) {
    return NextResponse.json(
      { error: "Недостатньо прав для видалення" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const existing = await prisma.mgrCashOrder.findUnique({
    where: { id },
    select: {
      id: true,
      customerId: true,
      sale: { select: { customerId: true } },
      customer: { select: { code1C: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Оплату не знайдено" }, { status: 404 });
  }

  // Ownership: manager — лише свої клієнти. Резолвимо code1C платника
  // (Контрагент ордера або клієнт його реалізації).
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    let code1C = existing.customer?.code1C ?? null;
    if (!code1C && existing.sale?.customerId) {
      const saleCustomer = await prisma.customer.findUnique({
        where: { id: existing.sale.customerId },
        select: { code1C: true },
      });
      code1C = saleCustomer?.code1C ?? null;
    }
    if (!code1C || !myCodes.includes(code1C)) {
      return NextResponse.json(
        { error: "Оплату не знайдено" },
        { status: 404 },
      );
    }
  }

  // Клієнт для перерахунку боргу: платник ордера (customerId) або клієнт реалізації.
  const effectiveCustomerId =
    existing.customerId ?? existing.sale?.customerId ?? null;

  try {
    const debtMovements = await prisma.mgrDebtMovement.findMany({
      where: { sourceType: "cash_order", sourceId: id },
      select: { clientId: true },
    });
    const affectedClientIds = new Set(debtMovements.map((m) => m.clientId));

    // Парні ордери-здачі (розхід) цього приходу — потрібні їхні id, щоб прибрати
    // їхні рухи ДДС (реєстратор `local:<changeId>`).
    const changeOrders = await prisma.mgrCashOrder.findMany({
      where: { changeForId: id },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      // Спочатку прибираємо рух боргу цього ордера.
      await tx.mgrDebtMovement.deleteMany({
        where: { sourceType: "cash_order", sourceId: id },
      });
      // Рухи ДДС основного ордера + усіх його ордерів-здач.
      await deleteCashFlowMovementsForOrder(tx, [
        id,
        ...changeOrders.map((o) => o.id),
      ]);
      // Парний ордер-здача (розхід) посилається на цей прихід через changeForId —
      // видаляємо його теж, інакше лишиться «висячий» розхід.
      await tx.mgrCashOrder.deleteMany({ where: { changeForId: id } });
      await tx.mgrCashOrder.delete({ where: { id } });
    });

    // Резерв: якщо рухів не було, все одно перерахуємо клієнта-платника.
    if (affectedClientIds.size === 0 && effectiveCustomerId) {
      const clientId = await resolveClientIdByCustomer(
        prisma,
        effectiveCustomerId,
      );
      if (clientId) affectedClientIds.add(clientId);
    }
    if (affectedClientIds.size > 0) {
      await recomputeDebtForClients(prisma, [...affectedClientIds]);
    }

    revalidatePath("/manager/payments");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[L-TEX] Cash order delete failed", {
      cashOrderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка видалення оплати" },
      { status: 500 },
    );
  }
}
