import { Prisma } from "@ltex/db";
import { SALE_STATUS_LIST, type SaleStatus } from "@/lib/manager/sale-status";

/**
 * Блок «Реалізація» — Етап 1 (список) where-builder.
 *
 * Чиста (DB-agnostic) функція: будує Prisma `where` для списку реалізацій
 * (1С ФормаСписка РеализацияТоваровУслуг), узгоджений з ownership-скоупом.
 *
 * Особливості 1С-екрана:
 *  • за замовчуванням **архівні приховані** (`archived = true` = проведено в 1С);
 *    чекбокс «Відображати архівні» (`showArchived`) знімає це обмеження;
 *  • **пошук** матчить № документа (`docNumber`/`code1C`), клієнта
 *    (ім'я/телефон/місто) АБО товари всередині (назва/артикул номенклатури).
 *
 * Скоуп видимості (`customerCodes`) обчислюється у викликачі через
 * `getMyClientCodes1C` (admin → null = без обмеження; manager → масив code1C):
 *  • `null`        — без обмеження (admin);
 *  • `string[]`    — лише реалізації клієнтів з цими code1C (manager).
 */

const SALE_STATUS_SET = new Set<string>(SALE_STATUS_LIST);

/** Нормалізує сирий статус у allow-list або `""` (ігнорувати). */
export function normalizeSaleStatus(raw: string | undefined): SaleStatus | "" {
  const v = (raw ?? "").trim();
  return SALE_STATUS_SET.has(v) ? (v as SaleStatus) : "";
}

export interface BuildSalesWhereParams {
  /**
   * Скоуп клієнтів (code1C). `null` = admin (без обмеження); масив =
   * лише реалізації цих клієнтів (manager). Порожній масив тут НЕ очікується —
   * викликач має короткозамкнути 0-клієнтів окремо (повернути порожній список).
   */
  scope: string[] | null;
  /**
   * Додатковий точковий фільтр по конкретному клієнту (deeplink з картки).
   * Має бути в межах `scope` (перевіряється у викликачі).
   */
  clientCode1C?: string;
  /** Пошук: № / клієнт (ім'я·телефон·місто) / товари (назва·артикул). */
  search?: string;
  /** Статус документа (вже нормалізований allow-list-ом). */
  status?: SaleStatus | "";
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

/**
 * Будує `where` для `prisma.sale.findMany` / `.count`. Чиста функція — без I/O.
 */
export function buildSalesWhere(
  p: BuildSalesWhereParams,
): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = {};
  const customerWhere: Prisma.CustomerWhereInput = {};

  // Скоуп видимості (manager → лише свої клієнти).
  if (p.scope !== null) {
    customerWhere.code1C = { in: p.scope };
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

  // Пошук: № документа / клієнт (ім'я·телефон·місто) / товари (назва·артикул).
  if (p.search && p.search.trim().length > 0) {
    const q = p.search.trim();
    const or: Prisma.SaleWhereInput[] = [
      { number1C: { contains: q, mode: "insensitive" } },
      { code1C: { contains: q, mode: "insensitive" } },
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
    // № документа може бути введений як ціле число (docNumber), опц. з «№».
    const numericRaw = q.replace(/^№\s*/, "");
    if (/^\d+$/.test(numericRaw)) {
      or.push({ docNumber: Number.parseInt(numericRaw, 10) });
    }
    where.OR = or;
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

export interface RawSaleRow {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  agentName: string | null;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    code1C: string | null;
    city: string | null;
  };
  _count: { items: number };
}

export interface SaleListItem {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  status: string;
  totalEur: number;
  totalUah: number;
  archived: boolean;
  isActual: boolean;
  /** Торговий агент: `Sale.agentName` (історичний 1С-імпорт). */
  agentName: string | null;
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

/** Prisma include для рядка списку — узгоджено з RawSaleRow. */
export const saleRowInclude = {
  customer: {
    select: { id: true, name: true, code1C: true, city: true },
  },
  _count: { select: { items: true } },
} satisfies Prisma.SaleInclude;

/** Перетворює raw-реалізацію у плаский рядок списку. Чиста функція — без I/O. */
export function serializeSaleRow(s: RawSaleRow): SaleListItem {
  return {
    id: s.id,
    code1C: s.code1C,
    number1C: s.number1C,
    docNumber: s.docNumber,
    status: s.status,
    totalEur: s.totalEur,
    totalUah: s.totalUah,
    archived: s.archived,
    isActual: s.isActual,
    agentName: s.agentName,
    itemCount: s._count.items,
    createdAt: s.createdAt,
    customer: {
      id: s.customer.id,
      name: s.customer.name,
      code1C: s.customer.code1C,
      city: s.customer.city,
      // Область підставляється у page.tsx через batch-lookup за code1C.
      region: null,
    },
  };
}
