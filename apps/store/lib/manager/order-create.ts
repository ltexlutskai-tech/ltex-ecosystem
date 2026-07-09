import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import { nextOrderNumber1C } from "@/lib/manager/order-number-generator";
import {
  buildOrderEventBody,
  recordClientEventSafe,
} from "@/lib/manager/client-timeline";
import type {
  CreateOrderInputRaw,
  OrderDraftInput,
  OrderItemInput,
  UpdateOrderInputRaw,
} from "@/lib/validations/manager-order";

export interface CreateOrderCustomer {
  id: string;
  code1C: string | null;
  name: string;
}

export interface CreateOrderActor {
  /** id поточного менеджера — дефолт для assignedAgentUserId. */
  userId: string;
}

/** include-блок, що віддаємо з create/update — спільний для обох. */
const ORDER_INCLUDE = {
  items: {
    include: {
      product: { select: { code1C: true } },
      lot: { select: { barcode: true } },
    },
  },
  customer: { select: { id: true, code1C: true, name: true } },
} satisfies Prisma.OrderInclude;

/**
 * Чиста (без I/O) калькуляція totals + нормалізація рядків замовлення.
 *
 * - `totalEur = sum(items.priceEur)` (priceEur рядка — **сумарна** ціна позиції,
 *   як `lot.priceEur`);
 * - `totalUah = totalEur * rate` (rate — переданий або `getCurrentRate()`);
 * - items нормалізуються до Prisma-create shape (`lotId ?? null`, `quantity ?? 1`).
 *
 * Винесено окремо щоб create й update не дублювали логіку.
 */
export function buildOrderTotals(
  items: OrderItemInput[],
  rate: number,
): {
  totalEur: number;
  totalUah: number;
  itemRows: Array<{
    productId: string;
    lotId: string | null;
    priceEur: number;
    weight: number;
    quantity: number;
  }>;
} {
  const totalEur = items.reduce((sum, i) => sum + i.priceEur, 0);
  const totalUah = totalEur * rate;
  const itemRows = items.map((item) => ({
    productId: item.productId,
    lotId: item.lotId ?? null,
    priceEur: item.priceEur,
    weight: item.weight,
    quantity: item.quantity ?? 1,
  }));
  return { totalEur, totalUah, itemRows };
}

/**
 * Створює Order + items атомарно у `prisma.$transaction`. Розраховує
 * `totalEur = sum(items.priceEur)` та `totalUah = totalEur * rate`
 * (rate — input.exchangeRate якщо передано, інакше `getCurrentRate()`).
 *
 * Менеджерські поля (Етап 1): priceTypeId / deliveryMethod / cashOnDelivery /
 * assignedAgentUserId (дефолт — поточний менеджер) / exportTo1C.
 *
 * Обмінів із 1С немає — лише локальна логіка. Замовлення саме по собі не
 * створює руху боргу (борг зростає при проведенні реалізації, а не замовлення);
 * історія клієнта пишеться fire-and-forget через `recordClientEventSafe`
 * (локальний логер таймлайну, не обмін) і не блокує відповідь.
 */
export async function createOrderWithItems(
  input: CreateOrderInputRaw,
  customer: CreateOrderCustomer,
  actor: CreateOrderActor,
  options?: { clearOtherActual?: boolean },
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const items = (input.items ?? []) as OrderItemInput[];
  const { totalEur, totalUah, itemRows } = buildOrderTotals(items, rate);

  // Проведення документа (кнопка «Зберегти та провести») → status `posted`.
  // 7.3 (як у 1С «Заказ покупателя»): проведене замовлення ЛИШАЄТЬСЯ
  // актуальним і видимим — воно в роботі (Потреби/маршрути), допоки його не
  // закриють/скасують/відвантажать. Проведення лише блокує редагування.
  const post = input.post === true;

  const order = await prisma.$transaction(async (tx) => {
    // Force-create (admin/owner/senior_manager): знімаємо `isActual` зі старих
    // актуальних замовлень клієнта перед створенням нового (м'який аналог
    // 1С-автозакриття, БЕЗ постингу документа закриття).
    if (options?.clearOtherActual) {
      await tx.order.updateMany({
        where: {
          customerId: customer.id,
          isActual: true,
          archived: false,
          closedAt: null,
        },
        data: { isActual: false },
      });
    }

    // Людський номер (7.3): продовжуємо нумерацію 1С (L0000002478, …).
    const number1C = await nextOrderNumber1C(tx);

    const createData = {
      customerId: customer.id,
      number1C,
      status: post ? "posted" : "draft",
      archived: false,
      isActual: true,
      totalEur,
      totalUah,
      exchangeRate: rate,
      notes: input.notes,
      priceTypeId: input.priceTypeId ?? null,
      deliveryMethod: input.deliveryMethod ?? null,
      cashOnDelivery: input.cashOnDelivery ?? false,
      assignedAgentUserId: input.assignedAgentUserId ?? actor.userId,
      exportTo1C: input.exportTo1C ?? true,
      items: { create: itemRows },
    } satisfies Prisma.OrderCreateInput | Prisma.OrderUncheckedCreateInput;

    return tx.order.create({ data: createData, include: ORDER_INCLUDE });
  });

  // Авто-запис історії клієнта (Фаза 4) — fire-and-forget, не блокує відповідь.
  recordClientEventSafe({
    customerId: order.customerId,
    kind: "order",
    body: buildOrderEventBody(order.totalUah, order.items.length),
    authorUserId: actor.userId,
    metadata: { orderId: order.id },
  });

  return order;
}

/**
 * Оновлює існуючий Order (шапка + повна заміна items) атомарно у
 * `prisma.$transaction` і перераховує totals (як `createOrderWithItems`).
 *
 * Етап 2: items замінюються повністю (deleteMany + create), щоб не вести
 * складний diff — як у формі 1С при перепроведенні документа. Зміна статусу
 * (якщо передана) застосовується у тій самій транзакції; валідність переходу
 * перевіряє caller (endpoint) до виклику.
 */
export async function updateOrderWithItems(
  orderId: string,
  input: UpdateOrderInputRaw,
  actor: CreateOrderActor,
  options?: { nextStatus?: string },
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const items = (input.items ?? []) as OrderItemInput[];
  const { totalEur, totalUah, itemRows } = buildOrderTotals(items, rate);

  // 7.3: проведення (posted) НЕ архівує — замовлення в роботі, актуальне.
  // В архів іде лише скасоване (cancelled ⇒ archived + неактуальне).
  const becomesArchived = options?.nextStatus === "cancelled";

  // Актуальність: застосовуємо переданий `isActual`, якщо він є. Скасування
  // форсує `isActual=false` і має пріоритет над переданим значенням.
  const isActualUpdate =
    typeof input.isActual === "boolean" && !becomesArchived
      ? { isActual: input.isActual }
      : {};

  const order = await prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId } });
    return tx.order.update({
      where: { id: orderId },
      data: {
        status: options?.nextStatus,
        totalEur,
        totalUah,
        exchangeRate: rate,
        notes: input.notes ?? null,
        priceTypeId: input.priceTypeId ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        cashOnDelivery: input.cashOnDelivery ?? false,
        assignedAgentUserId: input.assignedAgentUserId ?? actor.userId,
        exportTo1C: input.exportTo1C ?? true,
        items: { create: itemRows },
        // Optimistic lock: інкрементуємо version при кожному PATCH.
        version: { increment: 1 },
        ...isActualUpdate,
        ...(becomesArchived ? { archived: true, isActual: false } : {}),
      },
      include: ORDER_INCLUDE,
    });
  });

  return order;
}

// ─── Автозбереження чернетки (draft) ────────────────────────────────────────
//
// Легкі шляхи для наскрізного autosave (План AUTOSAVE_REALTIME_PLAN §2, рівень
// 2). Пишуть ЛИШЕ шапку + рядки зі `status="draft"` (`archived=false`) БЕЗ
// жодних ефектів проведення: не чіпають гвардів «одне активне на клієнта» на
// рівні draft (чернетки можуть співіснувати; guard діє при явному
// створенні/проведенні), історію клієнта та нагадування. Це робить autosave
// безпечним для обліку — облікові ефекти з'являються ЛИШЕ при «Провести»
// (`createOrderWithItems`/`updateOrderWithItems` з `post`/`nextStatus`).

/**
 * Створює чернетку замовлення (`status="draft"`) — легкий шлях autosave.
 * Присвоює людський номер (продовжує 1С-нумерацію), як звичайне замовлення, щоб
 * проведений з чернетки документ мав номер. Повертає лише поля, потрібні формі.
 */
export async function createOrderDraft(
  input: OrderDraftInput,
  customer: CreateOrderCustomer,
  actor: CreateOrderActor,
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const items = (input.items ?? []) as OrderItemInput[];
  const { totalEur, totalUah, itemRows } = buildOrderTotals(items, rate);

  return prisma.$transaction(async (tx) => {
    const number1C = await nextOrderNumber1C(tx);
    return tx.order.create({
      data: {
        customerId: customer.id,
        number1C,
        status: "draft",
        archived: false,
        isActual: true,
        totalEur,
        totalUah,
        exchangeRate: rate,
        notes: input.notes ?? null,
        priceTypeId: input.priceTypeId ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        cashOnDelivery: input.cashOnDelivery ?? false,
        assignedAgentUserId: input.assignedAgentUserId ?? actor.userId,
        items: { create: itemRows },
      },
      select: { id: true, status: true, number1C: true, code1C: true },
    });
  });
}

/**
 * Оновлює чернетку замовлення (повна заміна шапки + items) — легкий шлях
 * autosave. Статус НЕ змінюється; жодних ефектів проведення. Caller (endpoint)
 * гарантує, що документ не заблокований.
 */
export async function updateOrderDraft(
  orderId: string,
  input: OrderDraftInput,
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const items = (input.items ?? []) as OrderItemInput[];
  const { totalEur, totalUah, itemRows } = buildOrderTotals(items, rate);

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId } });
    return tx.order.update({
      where: { id: orderId },
      data: {
        totalEur,
        totalUah,
        exchangeRate: rate,
        notes: input.notes ?? null,
        priceTypeId: input.priceTypeId ?? null,
        deliveryMethod: input.deliveryMethod ?? null,
        cashOnDelivery: input.cashOnDelivery ?? false,
        version: { increment: 1 },
        items: { create: itemRows },
      },
      select: { id: true, status: true, number1C: true, code1C: true },
    });
  });
}
