import { Prisma, prisma } from "@ltex/db";

/**
 * Серіалізація нагадувань + batch-lookup назв товарів для рядків
 * (`MgrReminderItem.productId` — плоский скаляр без relation, як у дочірніх
 * Маршрутного листа). Спільно між GET списку та PATCH `[id]`.
 */

export interface ReminderItemRow {
  id: string;
  productId: string;
  quantity: number;
  done: boolean;
}

export interface ReminderRow {
  id: string;
  body: string;
  remindAt: Date;
  completedAt: Date | null;
  snoozedUntilAt: Date | null;
  periodicity: string;
  isProductReminder: boolean;
  orderVideo: boolean;
  actionType: string;
  source: string;
  lotId: string | null;
  productId: string | null;
  clientId: string | null;
  orderId: string | null;
  createdAt: Date;
  client: {
    id: string;
    name: string;
    phonePrimary: string | null;
    code1C: string | null;
  } | null;
  order: {
    id: string;
    number1C: string | null;
  } | null;
  owner: { id: string; fullName: string } | null;
  items: ReminderItemRow[];
}

// `satisfies Prisma.MgrReminderInclude` — щоб TypeScript ловив неіснуючі поля
// у select (напр. `Order` НЕ має `docNumber` — раніше це давало runtime-500 на
// всіх запитах нагадувань, бо `as const` сам не валідує проти Prisma-типів).
export const REMINDER_INCLUDE = {
  client: {
    select: { id: true, name: true, phonePrimary: true, code1C: true },
  },
  order: { select: { id: true, number1C: true } },
  owner: { select: { id: true, fullName: true } },
  items: {
    select: { id: true, productId: true, quantity: true, done: true },
    orderBy: { createdAt: "asc" },
  },
} as const satisfies Prisma.MgrReminderInclude;

/**
 * Будує map productId → {name, articleCode} для усіх рядків переданих
 * нагадувань одним запитом.
 */
export async function fetchProductNames(
  reminders: { items: ReminderItemRow[] }[],
): Promise<Map<string, { name: string; articleCode: string | null }>> {
  const ids = new Set<string>();
  for (const r of reminders) {
    for (const item of r.items) ids.add(item.productId);
  }
  if (ids.size === 0) return new Map();

  const products = await prisma.product.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, articleCode: true },
  });
  return new Map(
    products.map((p) => [p.id, { name: p.name, articleCode: p.articleCode }]),
  );
}

export function serializeReminder(
  r: ReminderRow,
  productNames: Map<string, { name: string; articleCode: string | null }>,
) {
  return {
    id: r.id,
    body: r.body,
    remindAt: r.remindAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    snoozedUntilAt: r.snoozedUntilAt?.toISOString() ?? null,
    periodicity: r.periodicity,
    isProductReminder: r.isProductReminder,
    orderVideo: r.orderVideo,
    actionType: r.actionType,
    source: r.source,
    lotId: r.lotId,
    productId: r.productId,
    clientId: r.clientId,
    orderId: r.orderId,
    createdAt: r.createdAt.toISOString(),
    client: r.client
      ? {
          id: r.client.id,
          name: r.client.name,
          phone: r.client.phonePrimary,
          code1C: r.client.code1C,
        }
      : null,
    order: r.order
      ? {
          id: r.order.id,
          number1C: r.order.number1C,
        }
      : null,
    owner: r.owner ? { id: r.owner.id, fullName: r.owner.fullName } : null,
    items: r.items.map((item) => {
      const info = productNames.get(item.productId);
      return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        done: item.done,
        productName: info?.name ?? "(товар видалено)",
        articleCode: info?.articleCode ?? null,
      };
    }),
  };
}

/** Зручний хелпер: серіалізує один запис із власним batch-lookup. */
export async function serializeOne(r: ReminderRow) {
  const names = await fetchProductNames([r]);
  return serializeReminder(r, names);
}
