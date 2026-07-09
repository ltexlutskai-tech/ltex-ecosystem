import type { Prisma } from "@ltex/db";

/**
 * Блок «Маршрут» — побічні ефекти статус-переходів + Блок А (товар у дорозі).
 *
 * Життєвий цикл лота маршруту (дзеркалить центральну 1С):
 *   free → (відправка МЛ) in_transit → (продаж) sold | (повернення) free
 *
 *  • **dispatched** (`dispatchRouteSheetLots`): завантажені лоти → `in_transit`
 *    (знімається бронь). Товар фізично залишає склад і їде в машині. Рухи
 *    складу/дороги — у `route-sheet-transit.ts` (best-effort після коміту).
 *  • **completed** (`settleRouteSheetTransit`): лот, який продали у реалізаціях
 *    цього МЛ → `sold`; решта (не продані / повернення) → `free` (повертаються
 *    на склад).
 *
 * Історичні `archived` лоти НЕ чіпаються. Помічники no-op, коли рядків немає.
 */

/** Спільні поля очищення броні лота. */
const CLEAR_RESERVATION = {
  reservedForClientId: null,
  reservedForName: null,
  reservedByUserId: null,
  reservedByName: null,
  reservedUntil: null,
} as const;

/**
 * Відправка МЛ у виїзд: знімає бронь із завантажених лотів і переводить їх у
 * стан `in_transit` (товар у дорозі). Історичні `archived` лоти не зачіпаються.
 */
export async function dispatchRouteSheetLots(
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
    data: { ...CLEAR_RESERVATION, status: "in_transit" },
  });
}

/**
 * Завершення МЛ: розводить лоти «в дорозі» на продані/повернені.
 *   - лот у реалізаціях цього МЛ (Sale.routeSheetId, SaleItem.lotId) → `sold`;
 *   - решта завантажених лотів → `free` (повертаються на склад).
 * Історичні `archived` лоти не зачіпаються.
 */
export async function settleRouteSheetTransit(
  tx: Prisma.TransactionClient,
  routeSheetId: string,
): Promise<void> {
  const loadingRows = await tx.routeSheetLoading.findMany({
    where: { routeSheetId },
    select: { lotId: true },
  });
  const loadedLotIds = [...new Set(loadingRows.map((r) => r.lotId))];
  if (loadedLotIds.length === 0) return;

  // Лоти, продані у реалізаціях цього маршруту.
  const soldItems = await tx.saleItem.findMany({
    where: { sale: { routeSheetId }, lotId: { in: loadedLotIds } },
    select: { lotId: true },
  });
  const soldLotIds = new Set(
    soldItems.map((i) => i.lotId).filter((v): v is string => v != null),
  );
  const returnedLotIds = loadedLotIds.filter((id) => !soldLotIds.has(id));

  if (soldLotIds.size > 0) {
    await tx.lot.updateMany({
      where: { id: { in: [...soldLotIds] }, status: { not: "archived" } },
      data: { status: "sold" },
    });
  }
  if (returnedLotIds.length > 0) {
    await tx.lot.updateMany({
      where: { id: { in: returnedLotIds }, status: { not: "archived" } },
      data: { status: "free" },
    });
  }
}

/**
 * Розблокування МЛ у чернетку (повернення в роботу): лоти «в дорозі» цього
 * маршруту повертаються у `free` (щоб не зависали). `sold`/`archived`/`free`
 * лоти не чіпаються.
 */
export async function returnRouteSheetLotsToStock(
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
    where: { id: { in: lotIds }, status: "in_transit" },
    data: { status: "free" },
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
