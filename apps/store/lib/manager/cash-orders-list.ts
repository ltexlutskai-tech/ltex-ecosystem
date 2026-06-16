import { Prisma } from "@ltex/db";

/**
 * Блок «Оплати / Каса» — Етап 1 (список) where-builder.
 *
 * Чиста (DB-agnostic) функція: будує Prisma `where` для списку касових ордерів
 * (1С ФормаСписка КассовыйОрдер), узгоджений з ownership-скоупом.
 *
 * Особливості 1С-екрана (`docs/PAYMENTS_BLOCK_AUDIT.md` §G):
 *  • за замовчуванням **архівні приховані** (`archived = true`); чекбокс
 *    «Відображати архівні» (`archived` param) знімає це обмеження;
 *  • **пошук** матчить ім'я клієнта (через прямий FK `customer` АБО через
 *    `sale.customer`) та № документа (`docNumber`, ціле);
 *  • фільтр **виду руху** (`type`: income/expense);
 *  • період по `paidAt`.
 *
 * Скоуп видимості (`scope`) — результат `getMyClientCodes1C(user)`:
 *  • `null`     — без обмеження (admin);
 *  • `string[]` — лише ордери, чий клієнт (прямий або через реалізацію)
 *    має code1C з цього масиву (manager). Порожній масив тут НЕ очікується —
 *    викликач має короткозамкнути 0-клієнтів окремо.
 */

export type CashOrderTypeFilter = "income" | "expense";

const CASH_ORDER_TYPE_SET = new Set<string>(["income", "expense"]);

/** Нормалізує сирий вид руху у allow-list або `undefined` (ігнорувати). */
export function normalizeCashOrderType(
  raw: string | undefined,
): CashOrderTypeFilter | undefined {
  const v = (raw ?? "").trim();
  return CASH_ORDER_TYPE_SET.has(v) ? (v as CashOrderTypeFilter) : undefined;
}

export interface BuildCashOrdersWhereParams {
  /**
   * Скоуп клієнтів (code1C). `null` = admin (без обмеження); масив =
   * лише ордери цих клієнтів (manager). Порожній масив — короткозамкнути
   * у викликачі (повернути порожній список).
   */
  scope: string[] | null;
  /** Пошук: ім'я клієнта АБО № документа (ціле, опц. з «№»). */
  search?: string;
  /** Вид руху (income/expense). */
  type?: CashOrderTypeFilter;
  /**
   * Показувати архівні. За замовчуванням `false` — архівні приховані.
   */
  archived?: boolean;
  /** Період оплати (`paidAt`). */
  from?: Date;
  to?: Date;
  /** Per-column фільтр по імені клієнта (прямий FK), LIKE. */
  client?: string;
  /** Per-column фільтр по статті руху коштів, LIKE. */
  article?: string;
  /** Per-column фільтр по банк-рахунку, LIKE. */
  account?: string;
}

/**
 * Будує `where` для `prisma.mgrCashOrder.findMany` / `.count`.
 * Чиста функція — без I/O.
 */
export function buildCashOrdersWhere(
  p: BuildCashOrdersWhereParams,
): Prisma.MgrCashOrderWhereInput {
  const where: Prisma.MgrCashOrderWhereInput = {};
  const and: Prisma.MgrCashOrderWhereInput[] = [];

  // Скоуп видимості (manager → лише свої клієнти; через прямий FK ордера
  // АБО через реалізацію-підставу).
  if (p.scope !== null) {
    and.push({
      OR: [
        { customer: { code1C: { in: p.scope } } },
        { sale: { customer: { code1C: { in: p.scope } } } },
      ],
    });
  }

  // Архів: за замовчуванням приховуємо архівні (`archived = true`).
  if (!p.archived) {
    where.archived = false;
  }

  if (p.type) {
    where.type = p.type;
  }

  if (p.from || p.to) {
    where.paidAt = {
      ...(p.from ? { gte: p.from } : {}),
      ...(p.to ? { lte: p.to } : {}),
    };
  }

  // Пошук: ім'я клієнта (прямий / через реалізацію) + № документа.
  if (p.search && p.search.trim().length > 0) {
    const q = p.search.trim();
    const or: Prisma.MgrCashOrderWhereInput[] = [
      { number1C: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { sale: { customer: { name: { contains: q, mode: "insensitive" } } } },
    ];
    const numericRaw = q.replace(/^№\s*/, "");
    if (/^\d+$/.test(numericRaw)) {
      or.push({ docNumber: Number.parseInt(numericRaw, 10) });
    }
    and.push({ OR: or });
  }

  // Per-column фільтри (LIKE). Клієнт матчиться лише по прямому FK `customer`
  // (стабільний шлях для сортування/фільтрації; sale.customer не комбінується
  // в один orderBy-ключ — лишається у глобальному пошуку вище).
  if (p.client && p.client.trim().length > 0) {
    where.customer = {
      name: { contains: p.client.trim(), mode: "insensitive" },
    };
  }
  if (p.article && p.article.trim().length > 0) {
    where.cashFlowArticleRef = {
      name: { contains: p.article.trim(), mode: "insensitive" },
    };
  }
  if (p.account && p.account.trim().length > 0) {
    where.bankAccountRef = {
      name: { contains: p.account.trim(), mode: "insensitive" },
    };
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

// ─── Серіалізація рядка списку ──────────────────────────────────────────────

/** Prisma include для рядка списку — узгоджено з RawCashOrderRow. */
export const cashOrderRowInclude = {
  customer: { select: { id: true, name: true, code1C: true } },
  sale: {
    select: {
      id: true,
      customer: { select: { id: true, name: true, code1C: true } },
    },
  },
  bankAccountRef: { select: { id: true, name: true } },
  cashFlowArticleRef: { select: { id: true, name: true } },
} satisfies Prisma.MgrCashOrderInclude;

export interface RawCashOrderRow {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  type: string;
  documentSumEur: number;
  archived: boolean;
  paidAt: Date;
  saleId: string | null;
  customer: { id: string; name: string; code1C: string | null } | null;
  sale: {
    id: string;
    customer: { id: string; name: string; code1C: string | null };
  } | null;
  bankAccountRef: { id: string; name: string } | null;
  cashFlowArticleRef: { id: string; name: string } | null;
}

export interface CashOrderListItem {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  type: string;
  documentSumEur: number;
  archived: boolean;
  paidAt: Date;
  saleId: string | null;
  /** Ім'я клієнта (прямий FK → реалізація → «—»). */
  customerName: string;
  /** ID клієнта для лінку (прямий FK → реалізація → null). */
  customerId: string | null;
  bankAccountName: string | null;
  cashFlowArticleName: string | null;
}

/** Перетворює raw-ордер у плаский рядок списку. Чиста функція — без I/O. */
export function serializeCashOrderRow(o: RawCashOrderRow): CashOrderListItem {
  const customer = o.customer ?? o.sale?.customer ?? null;
  return {
    id: o.id,
    code1C: o.code1C,
    number1C: o.number1C,
    docNumber: o.docNumber,
    type: o.type,
    documentSumEur: o.documentSumEur,
    archived: o.archived,
    paidAt: o.paidAt,
    saleId: o.saleId,
    customerName: customer?.name ?? "—",
    customerId: customer?.id ?? null,
    bankAccountName: o.bankAccountRef?.name ?? null,
    cashFlowArticleName: o.cashFlowArticleRef?.name ?? null,
  };
}
