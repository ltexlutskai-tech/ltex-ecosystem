import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";

export const dynamic = "force-dynamic";

/**
 * Лічильники документів зі статусом «Очікує підтвердження» (pending) —
 * замовлення та реалізації, авто-створені з сайту. Для індикаторів у сайдбарі.
 *
 * Ownership: admin/owner (myCodes === null) → усі; менеджер → свої (за агентом
 * АБО за code1C клієнта). Soft-deleted (markedForDeletion) не рахуються.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const myCodes = await getMyClientCodes1C(user);
  // Менеджер без призначених клієнтів → нічого не рахуємо.
  if (myCodes !== null && myCodes.length === 0) {
    return NextResponse.json({ orders: 0, sales: 0 });
  }

  // Спільний OR-фільтр видимості (за агентом АБО за code1C клієнта).
  const orderOwn: Prisma.OrderWhereInput =
    myCodes === null
      ? {}
      : {
          OR: [
            { assignedAgentUserId: user.id },
            { customer: { code1C: { in: myCodes } } },
          ],
        };
  const saleOwn: Prisma.SaleWhereInput =
    myCodes === null
      ? {}
      : {
          OR: [
            { assignedAgentUserId: user.id },
            { customer: { code1C: { in: myCodes } } },
          ],
        };

  const [orders, sales] = await Promise.all([
    prisma.order.count({
      where: { status: "pending", markedForDeletion: false, ...orderOwn },
    }),
    prisma.sale.count({
      where: { status: "pending", markedForDeletion: false, ...saleOwn },
    }),
  ]);

  return NextResponse.json({ orders, sales });
}
