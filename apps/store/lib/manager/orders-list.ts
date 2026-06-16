import { Prisma } from "@ltex/db";
import {
  ORDER_STATUS_LIST,
  type OrderStatus,
} from "@/lib/manager/order-status";

/**
 * Блок «Замовлення» — Етап 3 (список) where-builder.
 *
 * Чиста (DB-agnostic) функція: будує Prisma `where` для списку замовлень
 * (1С ФормаСписка Заказ), узгоджений з ownership-скоупом викликача.
 *
 * Особливості 1С-екрана:
 *  • за замовчуванням **архівні приховані** (`archived = true` = проведено в 1С);
 *    чекбокс «Відображати архівні» (`showArchived`) знімає це обмеження;
 *  • **пошук `q`** матчить № замовлення (`code1C`), клієнта (ім'я/телефон/місто)
 *    АБО товари всередині замовлення (назва/артикул номенклатури).
 *
 * Скоуп видимості (`customerCodes`) обчислюється у викликачі через
 * `getMyClientCodes1C` (admin → null = без обмеження; manager → масив code1C):
 *  • `null`        — без обмеження (admin);
 *  • `string[]`    — лише замовлення клієнтів з цими code1C (manager).
 *
 * Базовий ownership НЕ послаблюється цим хелпером — він лише додає фільтри
 * поверх вже звуженого скоупу.
 */

const ORDER_STATUS_SET = new Set<string>(ORDER_STATUS_LIST);

/** Нормалізує сирий статус у allow-list або `""` (ігнорувати). */
export function normalizeOrderStatus(
  raw: string | undefined,
): OrderStatus | "" {
  const v = (raw ?? "").trim();
  return ORDER_STATUS_SET.has(v) ? (v as OrderStatus) : "";
}

export interface BuildOrdersWhereParams {
  /**
   * Скоуп клієнтів (code1C). `null` = admin (без обмеження); масив =
   * лише замовлення цих клієнтів (manager). Порожній масив тут НЕ очікується —
   * викликач має короткозамкнути 0-клієнтів окремо (повернути порожній список).
   */
  customerCodes: string[] | null;
  /**
   * Додатковий точковий фільтр по конкретному клієнту (deeplink з картки).
   * Має бути в межах `customerCodes` (перевіряється у викликачі).
   */
  clientCode1C?: string;
  /** Пошук: № / клієнт (ім'я·телефон·місто) / товари (назва·артикул). */
  q?: string;
  /** Статус документа (вже нормалізований allow-list-ом). */
  status?: OrderStatus | "";
  /**
   * Актуальність документа (1С «Статус заказа: Актуальне»):
   *  • `"actual"` (дефолт)  — лише `isActual = true`;
   *  • `"inactive"`         — лише `isActual = false`;
   *  • `"all"`              — без обмеження.
   */
  actuality?: OrderActuality;
  /** Період створення. */
  from?: Date;
  to?: Date;
  /**
   * Показувати архівні (проведені в 1С). За замовчуванням `false` —
   * архівні (`archived = true`) приховані.
   */
  showArchived?: boolean;
  /** Точковий фільтр по клієнту (текст → `customer.name contains`). */
  clientName?: string;
  /** Точковий фільтр по місту (текст → `customer.city contains`). */
  city?: string;
  /** Точковий фільтр по агенту (текст → `agentName contains`). */
  agent?: string;
}

export type OrderActuality = "actual" | "inactive" | "all";

/**
 * Будує `where` для `prisma.order.findMany` / `.count`. Чиста функція — без I/O.
 */
export function buildOrdersWhere(
  p: BuildOrdersWhereParams,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const customerWhere: Prisma.CustomerWhereInput = {};

  // Скоуп видимості (manager → лише свої клієнти).
  if (p.customerCodes !== null) {
    customerWhere.code1C = { in: p.customerCodes };
  }
  // Точковий клієнт (deeplink) — override `in` на конкретний code1C.
  if (p.clientCode1C) {
    customerWhere.code1C = p.clientCode1C;
  }
  // Per-column фільтри по клієнту/місту (текст, LIKE).
  if (p.clientName && p.clientName.trim().length > 0) {
    customerWhere.name = { contains: p.clientName.trim(), mode: "insensitive" };
  }
  if (p.city && p.city.trim().length > 0) {
    customerWhere.city = { contains: p.city.trim(), mode: "insensitive" };
  }
  if (Object.keys(customerWhere).length > 0) {
    where.customer = customerWhere;
  }

  // Per-column фільтр по агенту (текст, LIKE на `agentName`).
  if (p.agent && p.agent.trim().length > 0) {
    where.agentName = { contains: p.agent.trim(), mode: "insensitive" };
  }

  // Архів: за замовчуванням приховуємо проведені (archived = true).
  if (!p.showArchived) {
    where.archived = false;
  }

  // Актуальність документа (дефолт «actual» → лише isActual = true).
  const actuality = p.actuality ?? "actual";
  if (actuality === "actual") {
    where.isActual = true;
  } else if (actuality === "inactive") {
    where.isActual = false;
  }

  // Пошук: № замовлення / клієнт (ім'я·телефон·місто) / товари (назва·артикул).
  if (p.q && p.q.trim().length > 0) {
    const q = p.q.trim();
    where.OR = [
      { code1C: { contains: q, mode: "insensitive" } },
      { number1C: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { phone: { contains: q, mode: "insensitive" } } },
      { customer: { city: { contains: q, mode: "insensitive" } } },
      {
        items: {
          some: { product: { name: { contains: q, mode: "insensitive" } } },
        },
      },
      {
        items: {
          some: {
            product: { articleCode: { contains: q, mode: "insensitive" } },
          },
        },
      },
    ];
  }

  if (p.status) {
    where.status = p.status;
  }

  if (p.from || p.to) {
    where.createdAt = {
      ...(p.from ? { gte: p.from } : {}),
      ...(p.to ? { lte: p.to } : {}),
    };
  }

  return where;
}

// ─── Серіалізація рядка списку ──────────────────────────────────────────────

export interface RawOrderRow {
  id: string;
  code1C: string | null;
  number1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  agentName: string | null;
  deliveryMethod: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
    city: string | null;
  };
  _count: { items: number };
}

export interface OrderListItem {
  id: string;
  code1C: string | null;
  number1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  /** Торговий агент: `Order.agentName` (історичний 1С-імпорт). */
  agentName: string | null;
  /** Спосіб доставки: `Order.deliveryMethod` (code → label у UI). */
  deliveryMethod: string | null;
  itemCount: number;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
    city: string | null;
    /** Область клієнта (з MgrClient.region за code1C; batch-lookup у page.tsx). */
    region: string | null;
  };
}

/** Prisma include для рядка списку — узгоджено з RawOrderRow. */
export const orderRowInclude = {
  customer: {
    select: { id: true, name: true, code1C: true, city: true },
  },
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

/** Перетворює raw-замовлення у плаский рядок списку. Чиста функція — без I/O. */
export function serializeOrderRow(o: RawOrderRow): OrderListItem {
  return {
    id: o.id,
    code1C: o.code1C,
    number1C: o.number1C,
    status: o.status,
    totalEur: o.totalEur,
    totalUah: o.totalUah,
    archived: o.archived,
    isActual: o.isActual,
    agentName: o.agentName,
    deliveryMethod: o.deliveryMethod,
    itemCount: o._count.items,
    createdAt: o.createdAt,
    customer: {
      id: o.customer.id,
      name: o.customer.name,
      code1C: o.customer.code1C,
      city: o.customer.city,
      // Область підставляється у page.tsx через batch-lookup за code1C.
      region: null,
    },
  };
}
