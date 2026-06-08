import { Prisma, prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";
import { enqueueOrderCreate } from "@/lib/sync/enqueue";
import {
  buildOrderEventBody,
  recordClientEventSafe,
} from "@/lib/manager/client-timeline";
import type {
  CreateOrderInputRaw,
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
 * Після успіху — **fire-and-forget** enqueue до 1С (M1.5 sync pattern).
 * Якщо enqueue падає — order вже existing, користувач бачить успіх.
 * Той самий best-effort pattern як PATCH /clients/[id] з M1.5.
 */
export async function createOrderWithItems(
  input: CreateOrderInputRaw,
  customer: CreateOrderCustomer,
  actor: CreateOrderActor,
) {
  const rate = input.exchangeRate ?? (await getCurrentRate());
  const items = (input.items ?? []) as OrderItemInput[];
  const { totalEur, totalUah, itemRows } = buildOrderTotals(items, rate);

  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      status: "draft",
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
    },
    include: ORDER_INCLUDE,
  });

  enqueueOrderSyncSafe(order);

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
 *
 * Після успіху — fire-and-forget enqueue до 1С (best-effort, як create).
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
      },
      include: ORDER_INCLUDE,
    });
  });

  enqueueOrderSyncSafe(order);

  return order;
}

type OrderWithSyncRelations = Prisma.OrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;

/** Fire-and-forget enqueue до 1С — однаково для create й update. */
function enqueueOrderSyncSafe(order: OrderWithSyncRelations): void {
  enqueueOrderCreate({
    id: order.id,
    code1C: order.code1C,
    status: order.status,
    totalEur: order.totalEur,
    totalUah: order.totalUah,
    exchangeRate: order.exchangeRate,
    notes: order.notes,
    customer: { code1C: order.customer.code1C },
    items: order.items.map((i) => ({
      productId: i.productId,
      lotId: i.lotId,
      priceEur: i.priceEur,
      weight: i.weight,
      quantity: i.quantity,
      product: i.product ? { code1C: i.product.code1C } : null,
      lot: i.lot ? { barcode: i.lot.barcode } : null,
    })),
  }).catch((e: unknown) => {
    console.warn("[L-TEX] Failed to enqueue order sync", {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
