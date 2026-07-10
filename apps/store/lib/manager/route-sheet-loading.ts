import { Prisma, prisma } from "@ltex/db";
import { isActiveReservation } from "@/lib/manager/lot-booking";
import { unitPriceForType, type PriceEntry } from "@/lib/manager/order-pricing";

/**
 * Блок «Маршрутний лист» — Етап 2. Загрузка (скан) + Бракує + лічильники.
 *
 * Порт 1С `ФормаДокумента/Module.bsl`:
 *  • `ОбработкаСканирования`/`ДобавитьТовар` (`:1080`/`:1115`) — резолв ШК → лот,
 *    гард чужої броні, дедуплікація лота (раз), вага з лота, авто-прив'язка до
 *    замовлення за товаром(+лотом), запис рядка `ЗагрузкаМашины`
 *    (`RouteSheetLoading`);
 *  • `КоличествоЗагружено` — у 1С підтримується сервером обміну; у нас рахуємо
 *    самі з рядків Загрузки (Σ по замовленні+товарі+лоті);
 *  • `НеХватает` (Бракує, `:1406`) — замовлено − доступні складські залишки
 *    (чужі брані лоти = 0); у нас «доступний вільний лот» = `Lot.status='free'`
 *    і без активної чужої броні — та сама дефініція, що у підборі лотів
 *    Реалізації (`/api/v1/manager/products/[id]/lots` → `where.status='free'`)
 *    та у бронюванні (активна бронь знімає лот з вільних);
 *  • лічильник (`СтатисткаДокумента`, `:1342`): Заказов / заказано / загружено /
 *    не хватает.
 */

/** Хардкод 1С: тип цін скану — код `000000001` (мапиться у наш `wholesale`). */
export const LOADING_PRICE_TYPE_CODE = "wholesale";

/** Дефолтна вага мішка, якщо у лота вага відсутня/нульова (1С fallback 20). */
const DEFAULT_BAG_WEIGHT = 20;

// ─── Лічильники ──────────────────────────────────────────────────────────────

export interface RouteSheetCounters {
  /** К-сть рядків `Заказы` (RouteSheetOrder). */
  ordersCount: number;
  /** Σ `RouteSheetItem.quantity` (замовлено). */
  orderedQty: number;
  /** Σ `RouteSheetItem.quantityLoaded` (завантажено). */
  loadedQty: number;
  /** Σ нестачі по всіх позиціях (бракує). */
  shortageQty: number;
}

/** Рядок нестачі (обчислюваний — НЕ зберігається). */
export interface RouteSheetShortageRow {
  orderId: string | null;
  orderNumber: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  /** Скільки бракує (замовлено − доступні вільні лоти), завжди > 0. */
  shortage: number;
}

// ─── Чисті частини (тестовані без I/O) ─────────────────────────────────────────

/** Рядок Загрузки для матчингу до `RouteSheetItem` (підмножина полів). */
export interface LoadingMatchRow {
  orderId: string | null;
  productId: string;
  lotId: string | null;
  quantity: number;
  loaded: boolean;
  isReturn: boolean;
}

/**
 * Ключ матчингу рядка Загрузки до позиції замовлення:
 * `(orderId | productId | lotId)`. Той самий ключ, що й авто-прив'язка скану.
 */
export function loadingMatchKey(row: {
  orderId: string | null;
  productId: string;
  lotId: string | null;
}): string {
  return `${row.orderId ?? ""}|${row.productId}|${row.lotId ?? ""}`;
}

/**
 * Чиста агрегація `quantityLoaded` для кожної позиції замовлення.
 *
 * Для кожного `RouteSheetItem` рахує Σ `RouteSheetLoading.quantity` де
 * співпадають `orderId`+`productId`+`lotId` І рядок Загрузки `loaded=true` І
 * `isReturn=false` (повернені/невантажені рядки не зараховуються).
 *
 * Повертає Map(itemKey → loadedQty); ключ — `loadingMatchKey(item)`.
 */
export function computeLoadedQuantities(
  loading: LoadingMatchRow[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of loading) {
    if (!row.loaded || row.isReturn) continue;
    const key = loadingMatchKey(row);
    map.set(key, (map.get(key) ?? 0) + row.quantity);
  }
  return map;
}

/** Позиція замовлення для розрахунку нестачі (чиста частина). */
export interface ShortageOrderedRow {
  orderId: string | null;
  productId: string;
  quantity: number;
}

/**
 * Чистий розподіл нестачі: для кожного товару `available` вільних лотів
 * розподіляється між замовленнями (у порядку появи), нестача рядка =
 * `max(0, ordered − виділено)`. Повертає лише рядки з нестачею > 0.
 *
 * @param ordered   — рядки замовлень (orderId/productId/quantity).
 * @param available — Map(productId → к-сть доступних вільних лотів).
 */
export function allocateShortage(
  ordered: ShortageOrderedRow[],
  available: Map<string, number>,
): Array<{ orderId: string | null; productId: string; shortage: number }> {
  // Скільки залишку ще можна виділити по кожному товару.
  const remaining = new Map<string, number>();
  for (const [productId, qty] of available) {
    remaining.set(productId, qty);
  }
  const result: Array<{
    orderId: string | null;
    productId: string;
    shortage: number;
  }> = [];
  for (const row of ordered) {
    const have = remaining.get(row.productId) ?? 0;
    const allocated = Math.min(have, row.quantity);
    remaining.set(row.productId, have - allocated);
    const shortage = row.quantity - allocated;
    if (shortage > 0) {
      result.push({
        orderId: row.orderId,
        productId: row.productId,
        shortage,
      });
    }
  }
  return result;
}

/**
 * Чиста сума лічильників.
 *  • ordersCount — к-сть рядків Заказы;
 *  • orderedQty  — Σ item.quantity;
 *  • loadedQty   — Σ item.quantityLoaded;
 *  • shortageQty — Σ shortage.
 */
export function computeCounters(args: {
  ordersCount: number;
  items: Array<{ quantity: number; quantityLoaded: number }>;
  shortage: Array<{ shortage: number }>;
}): RouteSheetCounters {
  return {
    ordersCount: args.ordersCount,
    orderedQty: args.items.reduce((s, i) => s + i.quantity, 0),
    loadedQty: args.items.reduce((s, i) => s + i.quantityLoaded, 0),
    shortageQty: args.shortage.reduce((s, i) => s + i.shortage, 0),
  };
}

// ─── I/O частини ───────────────────────────────────────────────────────────────

export class RouteSheetLoadingError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "RouteSheetLoadingError";
    this.status = status;
  }
}

/**
 * Перерахунок `RouteSheetItem.quantityLoaded` із рядків `RouteSheetLoading`
 * (у транзакції). Для кожної позиції — Σ Загрузки за тим самим ключем.
 */
export async function recomputeQuantityLoaded(
  tx: Prisma.TransactionClient,
  routeSheetId: string,
): Promise<void> {
  const [items, loading] = await Promise.all([
    tx.routeSheetItem.findMany({
      where: { routeSheetId },
      select: { id: true, orderId: true, productId: true, lotId: true },
    }),
    tx.routeSheetLoading.findMany({
      where: { routeSheetId },
      select: {
        orderId: true,
        productId: true,
        lotId: true,
        quantity: true,
        loaded: true,
        isReturn: true,
      },
    }),
  ]);

  const loadedByKey = computeLoadedQuantities(loading);
  for (const item of items) {
    const qty = loadedByKey.get(loadingMatchKey(item)) ?? 0;
    await tx.routeSheetItem.update({
      where: { id: item.id },
      data: { quantityLoaded: qty },
    });
  }
}

/**
 * Обчислення нестачі (Бракує) для МЛ: по кожному замовленому товару
 * `shortage = ordered − availableFreeLots`, де availableFreeLots — к-сть
 * вільних лотів цього товару на складі (`Lot.status='free'`, без активної
 * чужої броні — та сама дефініція вільного лота, що й у Реалізації).
 * Повертає лише рядки з нестачею > 0, з резолвленими іменами товарів/замовлень.
 */
/** Розкладка складського залишку товару: вільно (без броні) + заброньовано. */
export interface StockBreakdown {
  /** Вільні лоти `status='free'` БЕЗ активної броні (можна вантажити). */
  free: number;
  /** Лоти з активною бронню (чиясь бронь — у вільний залишок не входять). */
  booked: number;
}

/**
 * Розкладка залишку по товарах (реєстр-аналог 1С `ТоварыНаСкладах`
 * − `ТоварыВРезервеНаСкладах` + бронь мішків): для кожного товару окремо
 * «вільний залишок» і «бронь». Заброньований мішок вантажити не можна
 * (і скан його блокує), тому у вільний залишок він не входить.
 *
 * @param bookedByAllowed — якщо передано set userId «агентів рейсу», бронь ЦИХ
 *   агентів рахується як вільна (свій мішок можна вантажити); бронь сторонніх —
 *   у `booked`. Без set будь-яка активна бронь → `booked`.
 */
export async function computeStockBreakdownByProduct(
  productIds: string[],
  now: Date = new Date(),
  bookedByAllowed?: Set<string>,
): Promise<Map<string, StockBreakdown>> {
  const map = new Map<string, StockBreakdown>();
  for (const productId of productIds)
    map.set(productId, { free: 0, booked: 0 });
  if (productIds.length === 0) return map;

  const lots = await prisma.lot.findMany({
    where: { productId: { in: productIds }, status: "free" },
    select: {
      productId: true,
      status: true,
      reservedByUserId: true,
      reservedUntil: true,
    },
  });
  for (const lot of lots) {
    const entry = map.get(lot.productId);
    if (!entry) continue;
    // `status='free'` уже виключає продані/зарезервовані; активна бронь
    // (денормалізована, може лишати status='free' до синку) — окремо.
    if (isActiveReservation(lot, now)) {
      const own =
        bookedByAllowed != null &&
        lot.reservedByUserId != null &&
        bookedByAllowed.has(lot.reservedByUserId);
      if (own) entry.free += 1;
      else entry.booked += 1;
    } else {
      entry.free += 1;
    }
  }
  return map;
}

/**
 * Вільний складський залишок по товарах (лише число «вільно»). Обгортка над
 * `computeStockBreakdownByProduct` для «Бракує» та інших місць.
 */
export async function computeAvailableStockByProduct(
  productIds: string[],
  now: Date = new Date(),
): Promise<Map<string, number>> {
  const breakdown = await computeStockBreakdownByProduct(productIds, now);
  const map = new Map<string, number>();
  for (const [productId, entry] of breakdown) map.set(productId, entry.free);
  return map;
}

/**
 * Множина «агентів рейсу» (userId) — тих, чия бронь мішка вважається «своєю»
 * для цього маршрутного листа (1С `ТоварыЗагрузки`/`ТорговыеАгенты`). Береться
 * автоматично: торгові агенти замовлень рейсу (`Order.assignedAgentUserId`) +
 * експедитор + автор документа. Мішок, заброньований кимось поза цим набором,
 * для складу — «чужа бронь» і його не можна вантажити.
 */
export async function getRouteSheetAllowedAgents(
  routeSheetId: string,
): Promise<Set<string>> {
  const [sheet, rsOrders] = await Promise.all([
    prisma.routeSheet.findUnique({
      where: { id: routeSheetId },
      select: { expeditorUserId: true, createdByUserId: true },
    }),
    prisma.routeSheetOrder.findMany({
      where: { routeSheetId },
      select: { orderId: true },
    }),
  ]);
  const set = new Set<string>();
  if (sheet?.expeditorUserId) set.add(sheet.expeditorUserId);
  if (sheet?.createdByUserId) set.add(sheet.createdByUserId);

  const orderIds = rsOrders.map((o) => o.orderId);
  if (orderIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { assignedAgentUserId: true },
    });
    for (const o of orders) {
      if (o.assignedAgentUserId) set.add(o.assignedAgentUserId);
    }
  }
  return set;
}

export async function computeRouteSheetShortage(
  routeSheetId: string,
  now: Date = new Date(),
): Promise<RouteSheetShortageRow[]> {
  const items = await prisma.routeSheetItem.findMany({
    where: { routeSheetId },
    select: { orderId: true, productId: true, quantity: true },
    orderBy: { id: "asc" },
  });
  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((i) => i.productId))];
  const availableByProduct = await computeAvailableStockByProduct(
    productIds,
    now,
  );

  const allocated = allocateShortage(
    items.map((i) => ({
      orderId: i.orderId,
      productId: i.productId,
      quantity: i.quantity,
    })),
    availableByProduct,
  );
  if (allocated.length === 0) return [];

  // Резолв імен.
  const orderIds = new Set<string>();
  for (const a of allocated) if (a.orderId) orderIds.add(a.orderId);
  const [orders, products] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, articleCode: true },
    }),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  return allocated.map((a) => {
    const order = a.orderId ? orderMap.get(a.orderId) : null;
    const product = productMap.get(a.productId);
    return {
      orderId: a.orderId,
      orderNumber: order?.code1C ?? null,
      productId: a.productId,
      productName: product?.name ?? null,
      articleCode: product?.articleCode ?? null,
      shortage: a.shortage,
    };
  });
}

/**
 * Обчислення лічильників МЛ (Заказов / заказано / загружено / не хватает).
 * Читає рядки Замовлень + Товарів + обчислену нестачу.
 */
export async function computeRouteSheetCounters(
  routeSheetId: string,
  now: Date = new Date(),
): Promise<RouteSheetCounters> {
  const [ordersCount, items, shortage] = await Promise.all([
    prisma.routeSheetOrder.count({ where: { routeSheetId } }),
    prisma.routeSheetItem.findMany({
      where: { routeSheetId },
      select: { quantity: true, quantityLoaded: true },
    }),
    computeRouteSheetShortage(routeSheetId, now),
  ]);
  return computeCounters({ ordersCount, items, shortage });
}

// ─── Дошка Завантаження (order-tree, порт центральної бази 1С) ────────────────

/** Колір рядка позиції на дошці Завантаження. */
export type LoadingRowColor = "green" | "yellow" | "red" | "none";

/**
 * Чиста функція кольору позиції (порт підсвітки центральної бази 1С):
 *  • green  — завантажено повністю (замовлено>0 і завантажено ≥ замовлено);
 *  • red    — ще потрібно вантажити, але вільного залишку на складі немає;
 *  • yellow — прогрес (частково завантажено, залишок є);
 *  • none   — не почато, товар на складі є (нейтральний рядок).
 */
export function loadingRowColor(args: {
  ordered: number;
  loaded: number;
  stock: number;
}): LoadingRowColor {
  const remaining = Math.max(0, args.ordered - args.loaded);
  if (args.ordered > 0 && remaining === 0) return "green";
  if (remaining > 0 && args.stock <= 0) return "red";
  if (args.loaded > 0 && remaining > 0) return "yellow";
  return "none";
}

/** Позиція товару на дошці Завантаження (одне замовлення × товар). */
export interface LoadingBoardRow {
  itemId: string;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  unit: string | null;
  /** Замовлено (RouteSheetItem.quantity). */
  ordered: number;
  /** Завантажено (RouteSheetItem.quantityLoaded). */
  loaded: number;
  /** Залишилось завантажити (max(0, ordered − loaded)). */
  remaining: number;
  /** Вільний залишок товару на складі (без чужої броні, мінус завантажене тут). */
  freeStock: number;
  /** Заброньовано (чужі активні броні на цей товар) — інформаційно. */
  booked: number;
  /** Продано по цьому замовленню+товару (Σ реалізацій рейсу) — 1С `КоличествоПродано`. */
  sold: number;
  price: number;
  sum: number;
  color: LoadingRowColor;
}

/** Група замовлення на дошці Завантаження (шапка + позиції). */
export interface LoadingBoardOrder {
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  city: string | null;
  rows: LoadingBoardRow[];
  orderedQty: number;
  loadedQty: number;
  soldQty: number;
  sum: number;
}

/**
 * Дошка Завантаження — order-tree центральної бази 1С у нашій системі: по кожному
 * замовленню перелік товарів із «Замовлено / Завантажено / Залишок складу» та
 * кольором стану. Залишок складу = вільні лоти товару (без активної броні) мінус
 * уже завантажені на цей МЛ (тобто «скільки ще можна взяти з полиці»). Червоний
 * рядок = треба вантажити, а вільного залишку немає (порт підсвітки 1С).
 */
export async function computeLoadingBoard(
  routeSheetId: string,
  now: Date = new Date(),
): Promise<LoadingBoardOrder[]> {
  const [items, rsOrders, loadingRows, saleItems] = await Promise.all([
    prisma.routeSheetItem.findMany({
      where: { routeSheetId },
      select: {
        id: true,
        orderId: true,
        customerId: true,
        productId: true,
        unit: true,
        quantity: true,
        price: true,
        sum: true,
        quantityLoaded: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.routeSheetOrder.findMany({
      where: { routeSheetId },
      select: { orderId: true, customerId: true, city: true },
      orderBy: { id: "asc" },
    }),
    prisma.routeSheetLoading.findMany({
      where: { routeSheetId, loaded: true, isReturn: false },
      select: { productId: true, lotId: true },
    }),
    prisma.routeSheetSaleItem.findMany({
      where: { routeSheetId },
      select: { orderId: true, productId: true, quantity: true },
    }),
  ]);
  if (items.length === 0) return [];

  // Продано по (замовлення|товар) — Σ рядків реалізацій рейсу (1С КоличествоПродано).
  const soldByKey = new Map<string, number>();
  for (const s of saleItems) {
    const key = `${s.orderId ?? ""}|${s.productId}`;
    soldByKey.set(key, (soldByKey.get(key) ?? 0) + s.quantity);
  }

  const productIds = [...new Set(items.map((i) => i.productId))];
  const allowedAgents = await getRouteSheetAllowedAgents(routeSheetId);
  const breakdownByProduct = await computeStockBreakdownByProduct(
    productIds,
    now,
    allowedAgents,
  );

  // Уже завантажені (унікальні) лоти на цьому МЛ — «пішли з полиці».
  const loadedLotsByProduct = new Map<string, Set<string>>();
  for (const r of loadingRows) {
    const set = loadedLotsByProduct.get(r.productId) ?? new Set<string>();
    set.add(r.lotId);
    loadedLotsByProduct.set(r.productId, set);
  }
  // Вільний залишок «на полиці» = вільно − уже завантажене на цей МЛ.
  const shelfByProduct = new Map<string, number>();
  const bookedByProduct = new Map<string, number>();
  for (const productId of productIds) {
    const b = breakdownByProduct.get(productId) ?? { free: 0, booked: 0 };
    const loadedHere = loadedLotsByProduct.get(productId)?.size ?? 0;
    shelfByProduct.set(productId, Math.max(0, b.free - loadedHere));
    bookedByProduct.set(productId, b.booked);
  }

  // Резолв імен (замовлення / клієнти / товари).
  const orderIds = new Set<string>();
  const customerIds = new Set<string>();
  for (const o of rsOrders) {
    orderIds.add(o.orderId);
    if (o.customerId) customerIds.add(o.customerId);
  }
  for (const it of items) {
    if (it.orderId) orderIds.add(it.orderId);
    if (it.customerId) customerIds.add(it.customerId);
  }
  const [orders, customers, products] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true, city: true },
        })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, articleCode: true },
    }),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Порядок груп: спершу замовлення в порядку `RouteSheetOrder`, далі решта.
  const groups = new Map<string, LoadingBoardOrder>();
  const groupKey = (orderId: string | null) => orderId ?? "__none__";
  const ensureGroup = (
    orderId: string | null,
    customerId: string | null,
    city: string | null,
  ): LoadingBoardOrder => {
    const key = groupKey(orderId);
    let g = groups.get(key);
    if (!g) {
      const order = orderId ? orderMap.get(orderId) : null;
      const customer = customerId ? customerMap.get(customerId) : null;
      g = {
        orderId,
        orderNumber: order?.code1C ?? null,
        customerId,
        customerName: customer?.name ?? null,
        city: city ?? customer?.city ?? null,
        rows: [],
        orderedQty: 0,
        loadedQty: 0,
        soldQty: 0,
        sum: 0,
      };
      groups.set(key, g);
    }
    return g;
  };

  // Заводимо групи в порядку RouteSheetOrder (навіть без позицій — не показуємо,
  // але зберігаємо порядок для тих, що мають позиції).
  for (const o of rsOrders) ensureGroup(o.orderId, o.customerId, o.city);

  for (const it of items) {
    const g = ensureGroup(it.orderId, it.customerId, null);
    const product = productMap.get(it.productId);
    const ordered = it.quantity;
    const loaded = it.quantityLoaded;
    const remaining = Math.max(0, ordered - loaded);
    const freeStock = shelfByProduct.get(it.productId) ?? 0;
    const booked = bookedByProduct.get(it.productId) ?? 0;
    const sold = soldByKey.get(`${it.orderId ?? ""}|${it.productId}`) ?? 0;
    g.rows.push({
      itemId: it.id,
      productId: it.productId,
      productName: product?.name ?? null,
      articleCode: product?.articleCode ?? null,
      unit: it.unit,
      ordered,
      loaded,
      remaining,
      freeStock,
      booked,
      sold,
      price: it.price,
      sum: it.sum,
      color: loadingRowColor({ ordered, loaded, stock: freeStock }),
    });
    g.orderedQty += ordered;
    g.loadedQty += loaded;
    g.soldQty += sold;
    g.sum += it.sum;
  }

  // Лише групи з позиціями, у вихідному порядку заведення.
  return [...groups.values()].filter((g) => g.rows.length > 0);
}

/** Рядок Загрузки у формі для UI (з резолвленими іменами). */
export interface RouteSheetLoadingView {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  productId: string;
  productName: string | null;
  articleCode: string | null;
  lotId: string;
  barcode: string;
  unit: string | null;
  quantity: number;
  weight: number;
  price: number;
  sum: number;
  pricePerKg: number;
  loaded: boolean;
  isReturn: boolean;
}

/**
 * Скан/ручний ввід ШК → рядок Загрузки. Порт 1С `ДобавитьТовар`:
 *  1. резолв ШК → лот (+ товар + ціни);
 *  2. гард чужої активної броні (409);
 *  3. дедуплікація лота на цьому МЛ (409, лот = один фізичний мішок);
 *  4. вага з лота (fallback 20); ціна/кг за прайсом (тип цін `wholesale`);
 *  5. авто-прив'язка до замовлення за товаром(+лотом) із `RouteSheetItem`;
 *  6. створення `RouteSheetLoading` + перерахунок `quantityLoaded`.
 *
 * @param userId — поточний користувач (не використовується для «своєї» броні —
 *   вона визначається агентами рейсу, див. `getRouteSheetAllowedAgents`).
 * @param opts.targetOrderId — прив'язати рядок до конкретного замовлення
 *   (режим 1С «Загрузка в заказ»); інакше авто-прив'язка за товаром.
 * Кидає `RouteSheetLoadingError` (404 не знайдено / 409 бронь чи дубль).
 */
export async function addLoadingByBarcode(
  routeSheetId: string,
  barcode: string,
  userId: string,
  now: Date = new Date(),
  opts: { targetOrderId?: string | null } = {},
): Promise<{ row: RouteSheetLoadingView }> {
  const code = barcode.trim();
  if (!code) {
    throw new RouteSheetLoadingError("Не вказано ШК", 400);
  }

  const lot = await prisma.lot.findUnique({
    where: { barcode: code },
    include: { product: { select: LOADING_PRODUCT_SELECT } },
  });
  if (!lot) {
    throw new RouteSheetLoadingError("Не знайдено товар за ШК", 404);
  }

  return insertLoadingRow(routeSheetId, lot, now, opts.targetOrderId ?? null);
}

/**
 * «Ручний рядок» Завантаження (1С — ручний рядок таблиці «Загрузка машины»):
 * додати мішок під товар БЕЗ фізичного скану. Якщо `lotId` вказано — беремо
 * саме той лот; інакше — перший вільний лот товару (без чужої броні, ще не в
 * Загрузці). Прив'язка — до `targetOrderId` (виділене замовлення) або авто.
 */
export async function addLoadingManual(
  routeSheetId: string,
  args: {
    productId: string;
    lotId?: string | null;
    targetOrderId?: string | null;
  },
  now: Date = new Date(),
): Promise<{ row: RouteSheetLoadingView }> {
  const allowedAgents = await getRouteSheetAllowedAgents(routeSheetId);

  let lot: LoadingLot | null = null;
  if (args.lotId) {
    lot = await prisma.lot.findUnique({
      where: { id: args.lotId },
      include: { product: { select: LOADING_PRODUCT_SELECT } },
    });
    if (!lot) throw new RouteSheetLoadingError("Лот не знайдено", 404);
    if (lot.productId !== args.productId) {
      throw new RouteSheetLoadingError("Лот не відповідає товару", 400);
    }
  } else {
    // Перший вільний лот товару, ще не в Загрузці цього МЛ, без чужої броні.
    const already = await prisma.routeSheetLoading.findMany({
      where: { routeSheetId },
      select: { lotId: true },
    });
    const usedLotIds = new Set(already.map((r) => r.lotId));
    const candidates = await prisma.lot.findMany({
      where: { productId: args.productId, status: "free" },
      include: { product: { select: LOADING_PRODUCT_SELECT } },
      orderBy: { id: "asc" },
    });
    lot =
      candidates.find(
        (l) =>
          !usedLotIds.has(l.id) &&
          !(isActiveReservation(l, now) && !isOwnBooking(l, allowedAgents)),
      ) ?? null;
    if (!lot) {
      throw new RouteSheetLoadingError(
        "Немає вільного мішка цього товару на складі",
        409,
      );
    }
  }

  return insertLoadingRow(
    routeSheetId,
    lot,
    now,
    args.targetOrderId ?? null,
    allowedAgents,
  );
}

/** Спільний select товару для рядків Завантаження. */
const LOADING_PRODUCT_SELECT = {
  id: true,
  name: true,
  articleCode: true,
  priceUnit: true,
  prices: { select: { priceType: true, amount: true, currency: true } },
} as const;

type LoadingLot = {
  id: string;
  productId: string;
  barcode: string;
  weight: number;
  status: string;
  reservedByUserId: string | null;
  reservedUntil: Date | null;
  product: {
    id: string;
    name: string;
    articleCode: string | null;
    priceUnit: string;
    prices: Array<{ priceType: string; amount: unknown; currency: string }>;
  };
};

/** Чи бронь лоту «своя» для рейсу — заброньована агентом рейсу. */
function isOwnBooking(
  lot: { reservedByUserId: string | null },
  allowedAgents: Set<string>,
): boolean {
  return (
    lot.reservedByUserId != null && allowedAgents.has(lot.reservedByUserId)
  );
}

/**
 * Спільна вставка рядка Завантаження для лота: гард чужої броні (за агентами
 * рейсу), дедуплікація, вага/ціна з лота, прив'язка до замовлення (виділене
 * `targetOrderId` або авто за товаром), tx-запис + перерахунок `quantityLoaded`.
 */
async function insertLoadingRow(
  routeSheetId: string,
  lot: LoadingLot,
  now: Date,
  targetOrderId: string | null,
  allowedAgentsIn?: Set<string>,
): Promise<{ row: RouteSheetLoadingView }> {
  const allowedAgents =
    allowedAgentsIn ?? (await getRouteSheetAllowedAgents(routeSheetId));

  // Гард чужої активної броні (1С `АктивнаБроньМішка`): бронь активна І не
  // належить жодному агенту рейсу.
  if (isActiveReservation(lot, now) && !isOwnBooking(lot, allowedAgents)) {
    const until = lot.reservedUntil
      ? lot.reservedUntil.toLocaleDateString("uk-UA")
      : "";
    throw new RouteSheetLoadingError(
      `Активна бронь мішка (інший менеджер)${until ? ` до ${until}` : ""}`,
      409,
    );
  }

  // Дедуплікація: лот уже додано на цей МЛ.
  const dup = await prisma.routeSheetLoading.findFirst({
    where: { routeSheetId, lotId: lot.id },
    select: { id: true },
  });
  if (dup) {
    throw new RouteSheetLoadingError("Лот вже додано", 409);
  }

  const weight = lot.weight > 0 ? lot.weight : DEFAULT_BAG_WEIGHT;
  const pricePerKg = Math.max(
    0,
    unitPriceForType(
      lot.product.prices as PriceEntry[],
      LOADING_PRICE_TYPE_CODE,
    ) ?? 0,
  );
  const quantity = 1;
  const price = pricePerKg * weight;
  const sum = quantity * price;

  const matchItem = await resolveLoadingMatch(
    routeSheetId,
    lot.product.id,
    lot.id,
    targetOrderId,
  );

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.routeSheetLoading.create({
      data: {
        routeSheetId,
        orderId: matchItem.orderId,
        customerId: matchItem.customerId,
        productId: lot.product.id,
        lotId: lot.id,
        barcode: lot.barcode,
        unit: null,
        quantity,
        weight,
        price,
        sum,
        pricePerKg,
        loaded: true,
        isReturn: false,
      },
    });
    await recomputeQuantityLoaded(tx, routeSheetId);
    return row;
  });

  const customer = created.customerId
    ? await prisma.customer.findUnique({
        where: { id: created.customerId },
        select: { name: true },
      })
    : null;
  const order = created.orderId
    ? await prisma.order.findUnique({
        where: { id: created.orderId },
        select: { code1C: true },
      })
    : null;

  return {
    row: {
      id: created.id,
      orderId: created.orderId,
      orderNumber: order?.code1C ?? null,
      customerId: created.customerId,
      customerName: customer?.name ?? null,
      productId: created.productId,
      productName: lot.product.name,
      articleCode: lot.product.articleCode,
      lotId: created.lotId,
      barcode: created.barcode,
      unit: created.unit,
      quantity: created.quantity,
      weight: created.weight,
      price: created.price,
      sum: created.sum,
      pricePerKg: created.pricePerKg,
      loaded: created.loaded,
      isReturn: created.isReturn,
    },
  };
}

/**
 * Визначення замовлення для рядка Завантаження. Якщо задано `targetOrderId`
 * (режим «у виділене замовлення») — беремо позицію цього замовлення+товару
 * (або хоча б клієнта цього замовлення). Інакше — авто: позиція за товаром+лотом,
 * далі перше недовантажене замовлення за товаром, далі будь-яка позиція товару.
 */
async function resolveLoadingMatch(
  routeSheetId: string,
  productId: string,
  lotId: string,
  targetOrderId: string | null,
): Promise<{ orderId: string | null; customerId: string | null }> {
  if (targetOrderId) {
    const item = await prisma.routeSheetItem.findFirst({
      where: { routeSheetId, orderId: targetOrderId, productId },
      select: { orderId: true, customerId: true },
    });
    if (item) return { orderId: item.orderId, customerId: item.customerId };
    // Замовлення обране, але товару в його потребі немає — все одно прив'язуємо
    // до нього (беремо клієнта із рядка Заказы).
    const rsOrder = await prisma.routeSheetOrder.findFirst({
      where: { routeSheetId, orderId: targetOrderId },
      select: { customerId: true },
    });
    return { orderId: targetOrderId, customerId: rsOrder?.customerId ?? null };
  }

  const byLot = await prisma.routeSheetItem.findFirst({
    where: { routeSheetId, productId, lotId },
    select: { orderId: true, customerId: true },
  });
  if (byLot) return { orderId: byLot.orderId, customerId: byLot.customerId };

  const byProduct = await prisma.routeSheetItem.findFirst({
    where: { routeSheetId, productId },
    select: { orderId: true, customerId: true },
  });
  return {
    orderId: byProduct?.orderId ?? null,
    customerId: byProduct?.customerId ?? null,
  };
}

/**
 * «Заповнити з вільних лотів» — авто-підбір вільних лотів під замовлені позиції
 * (наш аналог 1С «Заповнити/Подбор» центральної бази, БЕЗ обміну). Для кожної
 * позиції `RouteSheetItem` бере до (замовлено − вже завантажено) вільних лотів
 * цього товару (`Lot.status='free'`, без активної чужої броні), яких ще немає у
 * Загрузці цього МЛ, і створює рядки `RouteSheetLoading` (вага/ціна з лота,
 * авто-прив'язка до замовлення). Спільний пул лотів на товар — один лот не
 * призначається двічі. Повертає к-сть доданих рядків.
 */
export async function autoFillLoading(
  routeSheetId: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ added: number }> {
  const items = await prisma.routeSheetItem.findMany({
    where: { routeSheetId },
    select: {
      orderId: true,
      customerId: true,
      productId: true,
      quantity: true,
      quantityLoaded: true,
    },
    orderBy: { id: "asc" },
  });
  if (items.length === 0) return { added: 0 };

  const productIds = [...new Set(items.map((i) => i.productId))];

  // Лоти вже у Загрузці цього МЛ — пропускаємо.
  const already = await prisma.routeSheetLoading.findMany({
    where: { routeSheetId },
    select: { lotId: true },
  });
  const usedLotIds = new Set(already.map((r) => r.lotId));

  // Вільні лоти цих товарів (без активної чужої броні, ще не в Загрузці).
  const lots = await prisma.lot.findMany({
    where: { productId: { in: productIds }, status: "free" },
    select: {
      id: true,
      productId: true,
      status: true,
      barcode: true,
      weight: true,
      reservedByUserId: true,
      reservedUntil: true,
      product: {
        select: {
          prices: { select: { priceType: true, amount: true, currency: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const allowedAgents = await getRouteSheetAllowedAgents(routeSheetId);

  // Пул доступних лотів на товар (FIFO по id).
  const poolByProduct = new Map<
    string,
    Array<{ id: string; barcode: string; weight: number; prices: PriceEntry[] }>
  >();
  for (const lot of lots) {
    if (usedLotIds.has(lot.id)) continue;
    if (isActiveReservation(lot, now) && !isOwnBooking(lot, allowedAgents)) {
      continue; // активна чужа бронь (не агента рейсу) — не вільний
    }
    const arr = poolByProduct.get(lot.productId) ?? [];
    arr.push({
      id: lot.id,
      barcode: lot.barcode,
      weight: lot.weight,
      prices: lot.product.prices as PriceEntry[],
    });
    poolByProduct.set(lot.productId, arr);
  }

  const rows: Prisma.RouteSheetLoadingCreateManyInput[] = [];
  for (const item of items) {
    const need = Math.max(0, item.quantity - item.quantityLoaded);
    if (need <= 0) continue;
    const pool = poolByProduct.get(item.productId);
    if (!pool || pool.length === 0) continue;
    const take = pool.splice(0, need); // забираємо з пулу (не призначаємо двічі)
    for (const lot of take) {
      const weight = lot.weight > 0 ? lot.weight : DEFAULT_BAG_WEIGHT;
      const pricePerKg = Math.max(
        0,
        unitPriceForType(lot.prices, LOADING_PRICE_TYPE_CODE) ?? 0,
      );
      const price = pricePerKg * weight;
      rows.push({
        routeSheetId,
        orderId: item.orderId,
        customerId: item.customerId,
        productId: item.productId,
        lotId: lot.id,
        barcode: lot.barcode,
        unit: null,
        quantity: 1,
        weight,
        price,
        sum: price,
        pricePerKg,
        loaded: true,
        isReturn: false,
      });
    }
  }

  if (rows.length === 0) return { added: 0 };

  await prisma.$transaction(async (tx) => {
    await tx.routeSheetLoading.createMany({ data: rows });
    await recomputeQuantityLoaded(tx, routeSheetId);
  });

  return { added: rows.length };
}

/** Видалення рядка Загрузки + перерахунок `quantityLoaded`. */
export async function deleteLoadingRow(
  routeSheetId: string,
  loadingId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.routeSheetLoading.deleteMany({
      where: { id: loadingId, routeSheetId },
    });
    await recomputeQuantityLoaded(tx, routeSheetId);
  });
}

/** Поля рядка Загрузки, які можна редагувати через PATCH. */
export interface UpdateLoadingPatch {
  loaded?: boolean;
  isReturn?: boolean;
  weight?: number;
}

/**
 * Часткове оновлення рядка Загрузки (toggle `loaded`/`isReturn` або вага).
 * При зміні ваги перераховує `price`/`sum` із `pricePerKg`. Перераховує
 * `quantityLoaded` після зміни.
 */
export async function updateLoadingRow(
  routeSheetId: string,
  loadingId: string,
  patch: UpdateLoadingPatch,
): Promise<void> {
  const existing = await prisma.routeSheetLoading.findFirst({
    where: { id: loadingId, routeSheetId },
    select: { id: true, pricePerKg: true, quantity: true },
  });
  if (!existing) {
    throw new RouteSheetLoadingError("Рядок Загрузки не знайдено", 404);
  }

  const data: Prisma.RouteSheetLoadingUpdateInput = {};
  if (patch.loaded !== undefined) data.loaded = patch.loaded;
  if (patch.isReturn !== undefined) data.isReturn = patch.isReturn;
  if (patch.weight !== undefined) {
    const weight = patch.weight > 0 ? patch.weight : 0;
    const price = existing.pricePerKg * weight;
    data.weight = weight;
    data.price = price;
    data.sum = existing.quantity * price;
  }

  await prisma.$transaction(async (tx) => {
    await tx.routeSheetLoading.update({ where: { id: existing.id }, data });
    await recomputeQuantityLoaded(tx, routeSheetId);
  });
}

/** Завантажує рядки Загрузки МЛ з резолвленими іменами (для GET). */
export async function getRouteSheetLoadingRows(
  routeSheetId: string,
): Promise<RouteSheetLoadingView[]> {
  const rows = await prisma.routeSheetLoading.findMany({
    where: { routeSheetId },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) return [];

  const orderIds = new Set<string>();
  const customerIds = new Set<string>();
  const productIds = new Set<string>();
  for (const r of rows) {
    if (r.orderId) orderIds.add(r.orderId);
    if (r.customerId) customerIds.add(r.customerId);
    productIds.add(r.productId);
  }

  const [orders, customers, products] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true },
        })
      : Promise.resolve([]),
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { id: { in: [...productIds] } },
      select: { id: true, name: true, articleCode: true },
    }),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  return rows.map((r) => {
    const order = r.orderId ? orderMap.get(r.orderId) : null;
    const customer = r.customerId ? customerMap.get(r.customerId) : null;
    const product = productMap.get(r.productId);
    return {
      id: r.id,
      orderId: r.orderId,
      orderNumber: order?.code1C ?? null,
      customerId: r.customerId,
      customerName: customer?.name ?? null,
      productId: r.productId,
      productName: product?.name ?? null,
      articleCode: product?.articleCode ?? null,
      lotId: r.lotId,
      barcode: r.barcode,
      unit: r.unit,
      quantity: r.quantity,
      weight: r.weight,
      price: r.price,
      sum: r.sum,
      pricePerKg: r.pricePerKg,
      loaded: r.loaded,
      isReturn: r.isReturn,
    };
  });
}
