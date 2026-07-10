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

  // Вільні лоти цих товарів (status='free'); активна чужа бронь знімає лот з
  // доступних — звіряємо `reservedUntil`/`reservedByUserId` як у lot-booking.
  const lots = await prisma.lot.findMany({
    where: { productId: { in: productIds }, status: "free" },
    select: {
      productId: true,
      status: true,
      reservedByUserId: true,
      reservedUntil: true,
    },
  });

  const availableByProduct = new Map<string, number>();
  for (const productId of productIds) availableByProduct.set(productId, 0);
  for (const lot of lots) {
    // `status='free'` уже виключає продані/зарезервовані; додатково
    // відкидаємо лоти з активною бронню (денормалізована бронь може лишати
    // status='free' до синку — звіряємо явно).
    if (isActiveReservation(lot, now)) continue;
    availableByProduct.set(
      lot.productId,
      (availableByProduct.get(lot.productId) ?? 0) + 1,
    );
  }

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
 * @param userId — поточний менеджер (для перевірки «чужої» броні).
 * Кидає `RouteSheetLoadingError` (404 не знайдено / 409 бронь чи дубль).
 */
export async function addLoadingByBarcode(
  routeSheetId: string,
  barcode: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ row: RouteSheetLoadingView }> {
  const code = barcode.trim();
  if (!code) {
    throw new RouteSheetLoadingError("Не вказано ШК", 400);
  }

  const lot = await prisma.lot.findUnique({
    where: { barcode: code },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          articleCode: true,
          priceUnit: true,
          prices: { select: { priceType: true, amount: true, currency: true } },
        },
      },
    },
  });
  if (!lot) {
    throw new RouteSheetLoadingError("Не знайдено товар за ШК", 404);
  }

  // Гард чужої активної броні (1С `АктивнаБроньМішка`): бронь активна І не моя.
  if (isActiveReservation(lot, now) && lot.reservedByUserId !== userId) {
    const until = lot.reservedUntil
      ? lot.reservedUntil.toLocaleDateString("uk-UA")
      : "";
    throw new RouteSheetLoadingError(
      `Активна бронь мішка${until ? ` до ${until}` : ""}`,
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

  // Авто-прив'язка: спершу за товаром+лотом, далі лише за товаром.
  const matchItem =
    (await prisma.routeSheetItem.findFirst({
      where: { routeSheetId, productId: lot.product.id, lotId: lot.id },
      select: { orderId: true, customerId: true },
    })) ??
    (await prisma.routeSheetItem.findFirst({
      where: { routeSheetId, productId: lot.product.id },
      select: { orderId: true, customerId: true },
    }));

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.routeSheetLoading.create({
      data: {
        routeSheetId,
        orderId: matchItem?.orderId ?? null,
        customerId: matchItem?.customerId ?? null,
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

  // Резолв імен для відповіді.
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

  // Пул доступних лотів на товар (FIFO по id).
  const poolByProduct = new Map<
    string,
    Array<{ id: string; barcode: string; weight: number; prices: PriceEntry[] }>
  >();
  for (const lot of lots) {
    if (usedLotIds.has(lot.id)) continue;
    if (isActiveReservation(lot, now) && lot.reservedByUserId !== userId) {
      continue; // активна чужа бронь — не вільний
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
