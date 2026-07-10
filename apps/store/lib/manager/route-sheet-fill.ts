import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";

/**
 * Блок «Маршрутний лист» — Етап 1. Заповнення вкладок Заказы + Товари.
 *
 * Порт 1С `ФормаДокумента/Module.bsl`:
 *  • «Добавить» (Заказы) → рядок `RouteSheetOrder` + копіювання `Заказ.Товары`
 *    у `ТоварыЗаказов` (`RouteSheetItem`) + `Заказ.МаршрутныйЛист = Ссылка`
 *    (наш `Order.routeSheetId`);
 *  • видалення замовлення з МЛ → каскад видалення `RouteSheetOrder` +
 *    `RouteSheetItem` цього замовлення + обнулення `Order.routeSheetId`
 *    (1С `ПередЗаписью` знімає `.МаршрутныйЛист` із прибраних замовлень);
 *  • «Заповнити» (Товари) → повна перебудова `RouteSheetItem` з усіх
 *    замовлень МЛ (1С `ЗаполнитьТовар`).
 *
 * **Припущення по сумах (EUR-base, як Sale/Order):** рядки замовлення несуть
 * `OrderItem.priceEur` — **сумарну** ціну позиції в EUR. У `RouteSheetItem`:
 *   - `sum`   = `OrderItem.priceEur` (сумарна EUR-ціна рядка);
 *   - `price` = `sum / quantity` (ціна за мішок, EUR; 0 при quantity=0);
 *   - `quantity` = `OrderItem.quantity` (к-сть мішків);
 *   - `quantityLoaded` = 0 (заповнюється на Етапі 2 зі сканів Загрузки).
 * Тоді `RouteSheet.totalEur = Σ item.sum`, `totalUah = round(totalEur × курс)`.
 * Курс — поточний `getCurrentRate()` (знімок не зберігаємо на МЛ — це
 * диспетчерський документ; реальні суми продажу йдуть через Реалізації).
 */

/** Форма рядка `RouteSheetItem` без зв'язку з МЛ (для create). */
export interface AggregatedRouteSheetItem {
  orderId: string;
  customerId: string | null;
  productId: string;
  lotId: string | null;
  unit: string | null;
  quantity: number;
  price: number;
  sum: number;
  quantityLoaded: number;
}

/** Мінімальний shape рядка замовлення для агрегації (без I/O). */
export interface OrderItemForAggregation {
  orderId: string;
  customerId: string | null;
  productId: string;
  lotId: string | null;
  priceEur: number;
  weight: number;
  quantity: number;
}

/**
 * Чиста агрегація рядків замовлень у форму `RouteSheetItem`.
 *
 * Групує по (orderId + productId + lotId) — однакові позиції одного
 * замовлення складаються (к-сть та сума додаються), ціна за мішок
 * перераховується як `sum / quantity`. Рядки різних замовлень лишаються
 * окремими (на вкладці Товари — дерево по замовленню).
 */
export function aggregateItemsFromOrders(
  items: OrderItemForAggregation[],
): AggregatedRouteSheetItem[] {
  const map = new Map<string, AggregatedRouteSheetItem>();
  for (const it of items) {
    const key = `${it.orderId}|${it.productId}|${it.lotId ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.sum += it.priceEur;
      existing.price =
        existing.quantity > 0 ? existing.sum / existing.quantity : 0;
    } else {
      const quantity = it.quantity;
      const sum = it.priceEur;
      map.set(key, {
        orderId: it.orderId,
        customerId: it.customerId,
        productId: it.productId,
        lotId: it.lotId,
        unit: null,
        quantity,
        price: quantity > 0 ? sum / quantity : 0,
        sum,
        quantityLoaded: 0,
      });
    }
  }
  return [...map.values()];
}

/** totalEur = Σ sum; totalUah = round(totalEur × rate). Чиста функція. */
export function computeRouteSheetTotals(
  items: Array<{ sum: number }>,
  rateEur: number,
): { totalEur: number; totalUah: number } {
  const totalEur = items.reduce((s, i) => s + i.sum, 0);
  const totalUah = Math.round(totalEur * rateEur);
  return { totalEur, totalUah };
}

export class RouteSheetFillError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "RouteSheetFillError";
    this.status = status;
  }
}

/** Перерахунок `totalEur`/`totalUah` МЛ із поточних рядків (у транзакції). */
async function recomputeTotals(
  tx: Prisma.TransactionClient,
  routeSheetId: string,
  rateEur: number,
): Promise<{ totalEur: number; totalUah: number }> {
  const rows = await tx.routeSheetItem.findMany({
    where: { routeSheetId },
    select: { sum: true },
  });
  const { totalEur, totalUah } = computeRouteSheetTotals(rows, rateEur);
  await tx.routeSheet.update({
    where: { id: routeSheetId },
    data: { totalEur, totalUah },
  });
  return { totalEur, totalUah };
}

/**
 * Додає замовлення до МЛ: для кожного orderId — створює `RouteSheetOrder`,
 * копіює рядки `OrderItem` у `RouteSheetItem`, ставить `Order.routeSheetId`.
 * Перевіряє, що замовлення існує та ще не в іншому маршруті (1С: одне
 * замовлення — в одному МЛ). Атомарно у транзакції + перерахунок totals.
 *
 * Кидає `RouteSheetFillError`:
 *  - 404 якщо якогось замовлення немає;
 *  - 409 якщо замовлення вже в іншому маршруті (вже на цьому — ідемпотентно skip).
 */
export async function addOrdersToRouteSheet(
  routeSheetId: string,
  orderIds: string[],
): Promise<{ totalEur: number; totalUah: number; added: number }> {
  const uniqueIds = [...new Set(orderIds)];
  const rateEur = await getCurrentRate();

  const orders = await prisma.order.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      customerId: true,
      routeSheetId: true,
      customer: { select: { city: true } },
      items: {
        select: {
          productId: true,
          lotId: true,
          priceEur: true,
          weight: true,
          quantity: true,
        },
      },
    },
  });

  const found = new Map(orders.map((o) => [o.id, o]));
  for (const id of uniqueIds) {
    const o = found.get(id);
    if (!o) {
      throw new RouteSheetFillError("Замовлення не знайдено", 404);
    }
    if (o.routeSheetId && o.routeSheetId !== routeSheetId) {
      throw new RouteSheetFillError("Замовлення вже в іншому маршруті", 409);
    }
  }

  // Уже на цьому МЛ — ідемпотентно пропускаємо.
  const toAdd = orders.filter((o) => o.routeSheetId !== routeSheetId);

  // Нові замовлення додаються в кінець (position після наявного максимуму).
  const maxPos = await prisma.routeSheetOrder.aggregate({
    where: { routeSheetId },
    _max: { position: true },
  });
  let nextPos = (maxPos._max.position ?? -1) + 1;

  const totals = await prisma.$transaction(async (tx) => {
    for (const o of toAdd) {
      await tx.routeSheetOrder.create({
        data: {
          routeSheetId,
          orderId: o.id,
          customerId: o.customerId,
          city: o.customer?.city ?? null,
          position: nextPos++,
        },
      });
      const aggregated = aggregateItemsFromOrders(
        o.items.map((it) => ({
          orderId: o.id,
          customerId: o.customerId,
          productId: it.productId,
          lotId: it.lotId,
          priceEur: it.priceEur,
          weight: it.weight,
          quantity: it.quantity,
        })),
      );
      if (aggregated.length > 0) {
        await tx.routeSheetItem.createMany({
          data: aggregated.map((a) => ({ ...a, routeSheetId })),
        });
      }
      await tx.order.update({
        where: { id: o.id },
        data: { routeSheetId },
      });
    }
    return recomputeTotals(tx, routeSheetId, rateEur);
  });

  return { ...totals, added: toAdd.length };
}

/**
 * Зміна порядку замовлень у маршруті (послідовність рейсу). Приймає повний
 * список `orderId` у бажаному порядку; виставляє `position` за індексом.
 * Ігнорує id, яких немає на цьому МЛ; наявні, що не потрапили в список,
 * лишаються після впорядкованих (їм дається position після хвоста).
 */
export async function reorderRouteSheetOrders(
  routeSheetId: string,
  orderIds: string[],
): Promise<void> {
  const links = await prisma.routeSheetOrder.findMany({
    where: { routeSheetId },
    select: { id: true, orderId: true },
  });
  const byOrderId = new Map(links.map((l) => [l.orderId, l.id]));

  const seen = new Set<string>();
  const sequence: string[] = [];
  for (const oid of orderIds) {
    if (byOrderId.has(oid) && !seen.has(oid)) {
      seen.add(oid);
      sequence.push(oid);
    }
  }
  // Хвіст: наявні замовлення, яких не було у переданому списку.
  for (const l of links) {
    if (!seen.has(l.orderId)) sequence.push(l.orderId);
  }

  await prisma.$transaction(
    sequence.map((oid, index) =>
      prisma.routeSheetOrder.update({
        where: { id: byOrderId.get(oid)! },
        data: { position: index },
      }),
    ),
  );
}

/**
 * Прибирає замовлення з МЛ: видаляє `RouteSheetOrder` + `RouteSheetItem`
 * цього замовлення та обнуляє `Order.routeSheetId` (лише якщо воно справді
 * вказувало на цей МЛ). Атомарно + перерахунок totals.
 */
export async function removeOrderFromRouteSheet(
  routeSheetId: string,
  orderId: string,
): Promise<{ totalEur: number; totalUah: number }> {
  const rateEur = await getCurrentRate();
  return prisma.$transaction(async (tx) => {
    await tx.routeSheetItem.deleteMany({ where: { routeSheetId, orderId } });
    await tx.routeSheetOrder.deleteMany({ where: { routeSheetId, orderId } });
    await tx.order.updateMany({
      where: { id: orderId, routeSheetId },
      data: { routeSheetId: null },
    });
    return recomputeTotals(tx, routeSheetId, rateEur);
  });
}

/**
 * «Заповнити» (вкладка Товари): повна перебудова `RouteSheetItem` з рядків
 * усіх замовлень, прикріплених до МЛ (1С `ЗаполнитьТовар`). Видаляє наявні
 * рядки товарів і складає наново. Не чіпає `RouteSheetOrder`.
 */
export async function refillRouteSheetItems(
  routeSheetId: string,
): Promise<{ totalEur: number; totalUah: number }> {
  const rateEur = await getCurrentRate();
  const links = await prisma.routeSheetOrder.findMany({
    where: { routeSheetId },
    select: { orderId: true },
  });
  const orderIds = links.map((l) => l.orderId);

  const orders =
    orderIds.length > 0
      ? await prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: {
            id: true,
            customerId: true,
            items: {
              select: {
                productId: true,
                lotId: true,
                priceEur: true,
                weight: true,
                quantity: true,
              },
            },
          },
        })
      : [];

  const aggregated = orders.flatMap((o) =>
    aggregateItemsFromOrders(
      o.items.map((it) => ({
        orderId: o.id,
        customerId: o.customerId,
        productId: it.productId,
        lotId: it.lotId,
        priceEur: it.priceEur,
        weight: it.weight,
        quantity: it.quantity,
      })),
    ),
  );

  return prisma.$transaction(async (tx) => {
    await tx.routeSheetItem.deleteMany({ where: { routeSheetId } });
    if (aggregated.length > 0) {
      await tx.routeSheetItem.createMany({
        data: aggregated.map((a) => ({ ...a, routeSheetId })),
      });
    }
    return recomputeTotals(tx, routeSheetId, rateEur);
  });
}
