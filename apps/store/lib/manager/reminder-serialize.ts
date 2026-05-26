import { prisma } from "@ltex/db";

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
  createdAt: Date;
  client: { id: string; name: string } | null;
  owner: { id: string; fullName: string } | null;
  items: ReminderItemRow[];
}

export const REMINDER_INCLUDE = {
  client: { select: { id: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  items: {
    select: { id: true, productId: true, quantity: true, done: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

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
    createdAt: r.createdAt.toISOString(),
    client: r.client ? { id: r.client.id, name: r.client.name } : null,
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
