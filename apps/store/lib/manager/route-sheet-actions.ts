import type { Prisma } from "@ltex/db";

/**
 * Блок «Маршрутний лист» — побічні ефекти статус-переходу (5.4.3, Частина A).
 *
 * Коли маршрутний лист переходить у `dispatched`/`completed`, дзеркалимо 1С:
 *  • знімаємо бронь з завантажених лотів (вони фактично відвантажені/продані);
 *  • позначаємо пов'язані замовлення `isActual=false` (зняті з активного списку).
 *
 * **Семантика — перша редакція, очікує перегляду.** Це go-forward поведінка:
 * історичні імпортовані листи вже completed/archived і цей шлях не тригерять.
 * Лоти зі статусом `archived` (історичні) НЕ чіпаємо. Помічники no-op коли
 * відповідних рядків немає.
 */

/**
 * Знімає бронь із завантажених лотів МЛ і позначає їх проданими. Читає
 * `RouteSheetLoading.lotId` цього листа → чистить reservation-поля лота та
 * ставить `status="sold"`. Історичні `archived` лоти не зачіпаються.
 */
export async function releaseRouteSheetReservations(
  tx: Prisma.TransactionClient,
  routeSheetId: string,
): Promise<void> {
  const loadingRows = await tx.routeSheetLoading.findMany({
    where: { routeSheetId },
    select: { lotId: true },
  });
  const lotIds = [...new Set(loadingRows.map((r) => r.lotId))];
  if (lotIds.length === 0) return;

  await tx.lot.updateMany({
    where: { id: { in: lotIds }, status: { not: "archived" } },
    data: {
      reservedForClientId: null,
      reservedForName: null,
      reservedByUserId: null,
      reservedByName: null,
      reservedUntil: null,
      status: "sold",
    },
  });
}

/**
 * Позначає замовлення цього маршрутного листа неактуальними (`isActual=false`)
 * — дзеркалить 1С, де відправлені замовлення зникають з активного списку.
 */
export async function markRouteSheetOrdersInactive(
  tx: Prisma.TransactionClient,
  routeSheetId: string,
): Promise<void> {
  const orderRows = await tx.routeSheetOrder.findMany({
    where: { routeSheetId },
    select: { orderId: true },
  });
  const orderIds = [...new Set(orderRows.map((r) => r.orderId))];
  if (orderIds.length === 0) return;

  await tx.order.updateMany({
    where: { id: { in: orderIds } },
    data: { isActual: false },
  });
}
