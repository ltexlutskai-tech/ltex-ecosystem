import { prisma } from "@ltex/db";

/**
 * ТЗ 8.0 B4a — контроль посилань перед остаточним видаленням (1С «Видалення
 * позначених обʼєктів»).
 *
 * Перед фізичним стиранням обʼєкта треба переконатися, що на нього ніхто не
 * посилається. Якщо є бодай одне посилання АБО обʼєкт має історичний код 1С
 * (`code1C != null`) — фізичне видалення заборонено, дозволено лише архів
 * (дані та реєстри руху збережуться).
 *
 * `findReferences` повертає список блокуючих посилань. Порожній список +
 * `isHistorical1C=false` означає, що обʼєкт можна стерти назавжди.
 */

export type DeletableEntityType =
  | "client"
  | "order"
  | "sale"
  | "cash_order"
  | "route_sheet"
  | "dictionary"
  | "category"
  | "product";

export interface ReferenceBlocker {
  /** Людський опис, де використовується обʼєкт. */
  label: string;
  /** Скільки разів згадується. */
  count: number;
}

export interface ReferenceCheckResult {
  /** Чи можна фізично стерти (0 блокерів і не історичний 1С-запис). */
  canHardDelete: boolean;
  /** Обʼєкт має code1C — історична цінність, лише архів. */
  isHistorical1C: boolean;
  /** Перелік блокуючих посилань (для показу адміну). */
  blockers: ReferenceBlocker[];
  /** Обʼєкт узагалі знайдено? */
  found: boolean;
}

function result(
  found: boolean,
  isHistorical1C: boolean,
  blockers: ReferenceBlocker[],
): ReferenceCheckResult {
  return {
    found,
    isHistorical1C,
    blockers,
    canHardDelete: found && !isHistorical1C && blockers.length === 0,
  };
}

function pushIf(blockers: ReferenceBlocker[], label: string, count: number) {
  if (count > 0) blockers.push({ label, count });
}

export async function findReferences(
  entityType: DeletableEntityType,
  entityId: string,
  dictType?: string | null,
): Promise<ReferenceCheckResult> {
  switch (entityType) {
    case "client":
      return checkClient(entityId);
    case "order":
      return checkOrder(entityId);
    case "sale":
      return checkSale(entityId);
    case "cash_order":
      return checkCashOrder(entityId);
    case "route_sheet":
      return checkRouteSheet(entityId);
    case "dictionary":
      return checkDictionary(entityId, dictType ?? null);
    case "category":
      return checkCategory(entityId);
    case "product":
      return checkProduct(entityId);
    default:
      return result(false, false, []);
  }
}

async function checkClient(id: string): Promise<ReferenceCheckResult> {
  const client = await prisma.mgrClient.findUnique({
    where: { id },
    select: { code1C: true, phonePrimary: true },
  });
  if (!client) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];

  // Рухи боргу (регістр) — прямий FK Cascade, тобто фіз. видалення зітре весь
  // борг-регістр клієнта. Тому будь-який рух блокує стирання.
  const debtMoves = await prisma.mgrDebtMovement.count({
    where: { clientId: id },
  });
  pushIf(blockers, "Рухи боргу", debtMoves);

  // Документи привʼязані через Customer за спільним code1C / телефоном.
  const customerOr: Array<Record<string, unknown>> = [];
  if (client.code1C) customerOr.push({ code1C: client.code1C });
  if (client.phonePrimary) customerOr.push({ phone: client.phonePrimary });

  if (customerOr.length > 0) {
    const customerWhere = { customer: { OR: customerOr } };
    const [orders, sales, cashOrders] = await Promise.all([
      prisma.order.count({ where: customerWhere }),
      prisma.sale.count({ where: customerWhere }),
      prisma.mgrCashOrder.count({ where: customerWhere }),
    ]);
    pushIf(blockers, "Замовлення", orders);
    pushIf(blockers, "Реалізації", sales);
    pushIf(blockers, "Оплати (каса)", cashOrders);
  }

  return result(true, client.code1C != null, blockers);
}

async function checkOrder(id: string): Promise<ReferenceCheckResult> {
  const order = await prisma.order.findUnique({
    where: { id },
    select: { code1C: true },
  });
  if (!order) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];
  const [sales, reminders] = await Promise.all([
    prisma.sale.count({ where: { orderId: id } }),
    prisma.mgrReminder.count({ where: { orderId: id } }),
  ]);
  pushIf(blockers, "Реалізації на основі замовлення", sales);
  pushIf(blockers, "Нагадування", reminders);

  return result(true, order.code1C != null, blockers);
}

async function checkSale(id: string): Promise<ReferenceCheckResult> {
  const sale = await prisma.sale.findUnique({
    where: { id },
    select: { code1C: true },
  });
  if (!sale) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];
  const cashOrders = await prisma.mgrCashOrder.count({
    where: { saleId: id },
  });
  pushIf(blockers, "Оплати за реалізацією", cashOrders);

  return result(true, sale.code1C != null, blockers);
}

async function checkCashOrder(id: string): Promise<ReferenceCheckResult> {
  const cash = await prisma.mgrCashOrder.findUnique({
    where: { id },
    select: { code1C: true },
  });
  if (!cash) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];
  const change = await prisma.mgrCashOrder.count({
    where: { changeForId: id },
  });
  pushIf(blockers, "Парний ордер-здача", change);

  return result(true, cash.code1C != null, blockers);
}

async function checkRouteSheet(id: string): Promise<ReferenceCheckResult> {
  const rs = await prisma.routeSheet.findUnique({
    where: { id },
    select: { code1C: true },
  });
  if (!rs) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];
  const [sales, cashOrders, orders] = await Promise.all([
    prisma.sale.count({ where: { routeSheetId: id } }),
    prisma.mgrCashOrder.count({ where: { routeSheetId: id } }),
    prisma.order.count({ where: { routeSheetId: id } }),
  ]);
  pushIf(blockers, "Реалізації у листі", sales);
  pushIf(blockers, "Оплати у листі", cashOrders);
  pushIf(blockers, "Замовлення у листі", orders);

  return result(true, rs.code1C != null, blockers);
}

/**
 * Запис довідника: перевіряє, чи використовується у клієнтах.
 * dictType визначає, яке саме поле FK перевіряти.
 */
async function checkDictionary(
  id: string,
  dictType: string | null,
): Promise<ReferenceCheckResult> {
  const blockers: ReferenceBlocker[] = [];
  let code1C: string | null = null;

  switch (dictType) {
    case "client-statuses": {
      const [g, o] = await Promise.all([
        prisma.mgrClient.count({ where: { statusGeneralId: id } }),
        prisma.mgrClient.count({ where: { statusOperationalId: id } }),
      ]);
      pushIf(blockers, "Клієнти зі статусом", g + o);
      break;
    }
    case "search-channels":
      pushIf(
        blockers,
        "Клієнти з каналом",
        await prisma.mgrClient.count({ where: { searchChannelId: id } }),
      );
      break;
    case "categories-tt":
      pushIf(
        blockers,
        "Клієнти з категорією",
        await prisma.mgrClient.count({ where: { categoryTTId: id } }),
      );
      break;
    case "delivery-methods":
      pushIf(
        blockers,
        "Клієнти зі способом доставки",
        await prisma.mgrClient.count({ where: { deliveryMethodId: id } }),
      );
      break;
    case "routes": {
      const route = await prisma.mgrRoute.findUnique({
        where: { id },
        select: { code1C: true },
      });
      code1C = route?.code1C ?? null;
      const [primary, assign] = await Promise.all([
        prisma.mgrClient.count({ where: { primaryRouteId: id } }),
        prisma.mgrClientRouteAssignment.count({ where: { routeId: id } }),
      ]);
      pushIf(blockers, "Клієнти з маршрутом", primary + assign);
      break;
    }
    // producers та інші — без прямих FK на клієнта; лишаємо порожні блокери.
    default:
      break;
  }

  return result(true, code1C != null, blockers);
}

async function checkCategory(id: string): Promise<ReferenceCheckResult> {
  const cat = await prisma.category.findUnique({
    where: { id },
    select: { code1C: true },
  });
  if (!cat) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];
  const [children, products] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.product.count({ where: { categoryId: id } }),
  ]);
  pushIf(blockers, "Підкатегорії", children);
  pushIf(blockers, "Товари у категорії", products);

  return result(true, cat.code1C != null, blockers);
}

async function checkProduct(id: string): Promise<ReferenceCheckResult> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { code1C: true },
  });
  if (!product) return result(false, false, []);

  const blockers: ReferenceBlocker[] = [];
  const [lots, orderItems, saleItems, receivingItems, cartItems] =
    await Promise.all([
      prisma.lot.count({ where: { productId: id } }),
      prisma.orderItem.count({ where: { productId: id } }),
      prisma.saleItem.count({ where: { productId: id } }),
      prisma.receivingItem.count({ where: { productId: id } }),
      prisma.cartItem.count({ where: { productId: id } }),
    ]);
  pushIf(blockers, "Лоти", lots);
  pushIf(blockers, "Рядки замовлень", orderItems);
  pushIf(blockers, "Рядки реалізацій", saleItems);
  pushIf(blockers, "Рядки поступлень", receivingItems);
  pushIf(blockers, "У кошиках", cartItems);

  return result(true, product.code1C != null, blockers);
}
