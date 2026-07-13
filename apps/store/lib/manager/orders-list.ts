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
   * ID менеджера-переглядача (7.2 Блок 2). Коли переданий разом зі скоупом
   * (`customerCodes !== null`), видимість розширюється: менеджер бачить не лише
   * замовлення своїх клієнтів (по code1C), а й ті, де він — призначений агент
   * (`assignedAgentUserId`). Потрібно для сайтових клієнтів без code1C.
   * Не впливає на admin/analyst (`customerCodes === null`).
   */
  viewerUserId?: string;
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
  /**
   * Джерело замовлення (7.2 Блок 1):
   *  • `"site"`   — лише замовлення з кошика сайту (`source = "site"`);
   *  • `"manual"` — лише НЕ-сайтові (`source ≠ "site"`: ручні + 1С-імпорт);
   *  • інакше     — без обмеження.
   */
  source?: OrderSourceFilter;
}

export type OrderActuality = "actual" | "inactive" | "all";
export type OrderSourceFilter = "site" | "manual" | "";

/**
 * Будує `where` для `prisma.order.findMany` / `.count`. Чиста функція — без I/O.
 */
export function buildOrdersWhere(
  p: BuildOrdersWhereParams,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const customerWhere: Prisma.CustomerWhereInput = {};
  const andTerms: Prisma.OrderWhereInput[] = [];

  // Скоуп видимості (manager → лише свої клієнти).
  // 7.2 Блок 2: якщо переданий viewerUserId і це НЕ deeplink по клієнту —
  // розширюємо скоуп до OR(власний code1C, призначений агент) через AND-терм,
  // щоб менеджер бачив і сайтові замовлення (клієнт без code1C).
  if (p.customerCodes !== null) {
    if (p.viewerUserId && !p.clientCode1C) {
      andTerms.push({
        OR: [
          { customer: { code1C: { in: p.customerCodes } } },
          { assignedAgentUserId: p.viewerUserId },
        ],
      });
    } else {
      customerWhere.code1C = { in: p.customerCodes };
    }
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

  // Джерело замовлення (сайт / ручні).
  if (p.source === "site") {
    where.source = "site";
  } else if (p.source === "manual") {
    where.source = { not: "site" };
  }

  // Архів: за замовчуванням приховуємо історію 1С (`archived = true`).
  if (!p.showArchived) {
    where.archived = false;
  }

  // ТЗ 8.0 B6: позначені на вилучення завжди приховані зі списку (чекають на
  // рішення адміністратора у черзі `/manager/admin/deletions`).
  where.markedForDeletion = false;

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

  // Статус документа. Явний фільтр має пріоритет. Якщо статус не заданий і
  // не показуємо архів — ховаємо проведені (`posted`) з головного списку: вони
  // йдуть в архів (8.1); головний список лишає чернетки / не проведені /
  // очікують підтвердження.
  if (p.status) {
    where.status = p.status;
  } else if (!p.showArchived) {
    where.status = { not: "posted" };
  }

  if (p.from || p.to) {
    where.createdAt = {
      ...(p.from ? { gte: p.from } : {}),
      ...(p.to ? { lte: p.to } : {}),
    };
  }

  if (andTerms.length > 0) {
    where.AND = andTerms;
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
  source: string;
  agentName: string | null;
  assignedAgentUserId: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
    city: string | null;
    phone: string | null;
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
  /** Джерело: "site" (з кошика сайту) | "manager" | "1c". */
  source: string;
  /** Торговий агент: `Order.agentName` (історичний 1С-імпорт). */
  agentName: string | null;
  /** Призначений агент (User.id) — для сайтових замовлень без agentName. */
  assignedAgentUserId: string | null;
  /** Імʼя призначеного агента (batch-lookup у page.tsx за assignedAgentUserId). */
  assignedAgentName: string | null;
  itemCount: number;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
    city: string | null;
    phone: string | null;
    /** Область клієнта (MgrClient.region за code1C або телефоном; batch у page). */
    region: string | null;
  };
}

/** Prisma include для рядка списку — узгоджено з RawOrderRow. */
export const orderRowInclude = {
  customer: {
    select: { id: true, name: true, code1C: true, city: true, phone: true },
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
    source: o.source,
    agentName: o.agentName,
    assignedAgentUserId: o.assignedAgentUserId,
    // Імʼя призначеного агента підставляється у page.tsx (batch-lookup).
    assignedAgentName: null,
    itemCount: o._count.items,
    createdAt: o.createdAt,
    customer: {
      id: o.customer.id,
      name: o.customer.name,
      code1C: o.customer.code1C,
      city: o.customer.city,
      phone: o.customer.phone,
      // Область підставляється у page.tsx (batch-lookup за code1C або телефоном).
      region: null,
    },
  };
}
