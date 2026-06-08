import { prisma } from "@ltex/db";

/**
 * Активні замовлення для лічильника «претензій» на товар (← Етап 1 блоку
 * Замовлень, аналог відображення кількості замовлених лотів у 1С-мобільному).
 *
 * Менеджер бачить сумарну кількість замовленого по товару та перелік
 * замовлень, щоб розуміти хто й на скільки претендує. У 1С-мобільному
 * аналог — поле «кількість замовлених лотів» у списку прайсу/картки товару.
 *
 * «Активне» = замовлення ще не виконане і не скасоване, тобто `status` у
 * множині нижче і `archived = false`. Posted/cancelled/delivered НЕ
 * враховуються (товар уже не «в претензії»).
 *
 * Узгоджено з user 2026-06-02: показуємо тільки активні (без архівних).
 */
export const ACTIVE_CLAIM_STATUSES = [
  "draft",
  "sent",
  "pending",
  "approved",
  "shipped",
] as const;

export interface ProductClaimOrder {
  id: string;
  /** customer.name або «Без клієнта» */
  customerName: string;
  /** ПІБ призначеного торгового агента або null */
  agentName: string | null;
  /** Сумарна вага по цьому товару у цьому замовленні (кг) */
  weight: number;
  /** Сумарна кількість мішків по цьому товару у цьому замовленні (шт) */
  quantity: number;
  status: string;
  createdAt: string;
  /** true коли поточний користувач — призначений агент замовлення */
  isMine: boolean;
}

export interface ProductClaims {
  productId: string;
  /** Сума ваги по всіх активних замовленнях (кг) */
  totalWeight: number;
  /** Сума мішків по всіх активних замовленнях (шт) */
  totalQuantity: number;
  /** Скільки різних замовлень претендують */
  ordersCount: number;
  /** Скільки різних менеджерів причетні (за `assignedAgentUserId`) */
  managersCount: number;
  /** Список замовлень (відсортовано від найновішого) */
  orders: ProductClaimOrder[];
}

/**
 * Підрахувати кількість активних претензій на товар.
 *
 * Один запит з `include: customer + assignedAgentUserId` (User join — окремо
 * через scalar `assignedAgentUserId` без FK у схемі Order). Сортування — від
 * найновішого замовлення.
 *
 * @param productId  id товару
 * @param currentUserId  для позначки `isMine` у кожному замовленні
 */
export async function getProductClaims(
  productId: string,
  currentUserId: string,
): Promise<ProductClaims> {
  const items = await prisma.orderItem.findMany({
    where: {
      productId,
      order: {
        archived: false,
        status: { in: ACTIVE_CLAIM_STATUSES as unknown as string[] },
      },
    },
    select: {
      weight: true,
      quantity: true,
      order: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          assignedAgentUserId: true,
          customer: { select: { name: true } },
        },
      },
    },
  });

  // Зведення по замовленнях (можуть бути кілька OrderItem одного product у одному
  // замовленні — після підбору з прайсу теоретично один рядок, але страхуємо суму).
  const byOrder = new Map<
    string,
    {
      orderId: string;
      status: string;
      createdAt: Date;
      assignedAgentUserId: string | null;
      customerName: string;
      weight: number;
      quantity: number;
    }
  >();

  for (const it of items) {
    const o = it.order;
    const acc = byOrder.get(o.id);
    if (acc) {
      acc.weight += it.weight;
      acc.quantity += it.quantity;
    } else {
      byOrder.set(o.id, {
        orderId: o.id,
        status: o.status,
        createdAt: o.createdAt,
        assignedAgentUserId: o.assignedAgentUserId,
        customerName: o.customer?.name ?? "Без клієнта",
        weight: it.weight,
        quantity: it.quantity,
      });
    }
  }

  // Резолв ПІБ агентів одним запитом (batch lookup).
  const agentIds = [
    ...new Set(
      [...byOrder.values()]
        .map((o) => o.assignedAgentUserId)
        .filter((x): x is string => !!x),
    ),
  ];
  const agents = agentIds.length
    ? await prisma.user.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const agentNameById = new Map(agents.map((a) => [a.id, a.fullName]));

  const orders: ProductClaimOrder[] = [...byOrder.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((o) => ({
      id: o.orderId,
      customerName: o.customerName,
      agentName: o.assignedAgentUserId
        ? (agentNameById.get(o.assignedAgentUserId) ?? null)
        : null,
      weight: round1(o.weight),
      quantity: o.quantity,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      isMine: o.assignedAgentUserId === currentUserId,
    }));

  const totalWeight = round1(orders.reduce((sum, o) => sum + o.weight, 0));
  const totalQuantity = orders.reduce((sum, o) => sum + o.quantity, 0);
  const managersCount = new Set(
    orders.map((o) => o.agentName ?? "—").filter((a) => a !== "—"),
  ).size;

  return {
    productId,
    totalWeight,
    totalQuantity,
    ordersCount: orders.length,
    managersCount,
    orders,
  };
}

/**
 * Облегшений варіант для списку Прайсу — лише сумарні лічильники без orders[],
 * для багатьох товарів одним запитом (batch).
 */
export async function getProductClaimsSummaries(
  productIds: string[],
): Promise<
  Map<
    string,
    { totalQuantity: number; totalWeight: number; ordersCount: number }
  >
> {
  if (productIds.length === 0) return new Map();

  const items = await prisma.orderItem.findMany({
    where: {
      productId: { in: productIds },
      order: {
        archived: false,
        status: { in: ACTIVE_CLAIM_STATUSES as unknown as string[] },
      },
    },
    select: { productId: true, orderId: true, weight: true, quantity: true },
  });

  // productId -> { totalQuantity, totalWeight, ordersSet }
  const byProduct = new Map<
    string,
    { totalQuantity: number; totalWeight: number; orders: Set<string> }
  >();
  for (const it of items) {
    let acc = byProduct.get(it.productId);
    if (!acc) {
      acc = { totalQuantity: 0, totalWeight: 0, orders: new Set() };
      byProduct.set(it.productId, acc);
    }
    acc.totalQuantity += it.quantity;
    acc.totalWeight += it.weight;
    acc.orders.add(it.orderId);
  }

  const out = new Map<
    string,
    { totalQuantity: number; totalWeight: number; ordersCount: number }
  >();
  for (const [pid, acc] of byProduct) {
    out.set(pid, {
      totalQuantity: acc.totalQuantity,
      totalWeight: round1(acc.totalWeight),
      ordersCount: acc.orders.size,
    });
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
