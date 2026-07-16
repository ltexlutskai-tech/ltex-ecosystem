import { Prisma } from "@ltex/db";

/**
 * Ліди з сайту — чистий (DB-agnostic) where-builder для списку лідів.
 *
 * Семантика чипів статусу ІДЕНТИЧНА старій `whereForFilter`:
 *  • `active` (за замовчуванням) — статус у [new, contacted];
 *  • `converted` — status = "converted";
 *  • `rejected` — status = "rejected";
 *  • `all` — без обмеження статусу.
 *
 * Поверх статусу AND-комбінуються додаткові фільтри:
 *  • `q` — текстовий пошук (ім'я АБО телефон АБО місто, insensitive contains);
 *  • `city` / `source` — точний збіг;
 *  • `from` / `to` — діапазон `createdAt` (ISO yyyy-mm-dd; `to` включно до
 *    кінця доби).
 */

export const LEADS_FILTERS = [
  "active",
  "converted",
  "rejected",
  "all",
] as const;
export type LeadsFilter = (typeof LEADS_FILTERS)[number];

/** Нормалізує сирий чип статусу у allow-list (fallback → "active"). */
export function normalizeLeadsFilter(raw: string | undefined): LeadsFilter {
  return (LEADS_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as LeadsFilter)
    : "active";
}

export interface BuildLeadsWhereParams {
  /** Чип статусу (нормалізується всередині). */
  filter?: string;
  /** Пошук: ім'я / телефон / місто (insensitive contains). */
  q?: string;
  /** Точний збіг міста. */
  city?: string;
  /** Точний збіг джерела. */
  source?: string;
  /** Початок діапазону `createdAt` (ISO yyyy-mm-dd). */
  from?: string;
  /** Кінець діапазону `createdAt` (ISO yyyy-mm-dd, включно до кінця доби). */
  to?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Парсить yyyy-mm-dd у момент початку доби (локальний час). */
function parseDayStart(s?: string): Date | undefined {
  if (!s || !DATE_RE.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Парсить yyyy-mm-dd у момент кінця доби (включно). */
function parseDayEnd(s?: string): Date | undefined {
  if (!s || !DATE_RE.test(s)) return undefined;
  const d = new Date(`${s}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function statusWhere(filter: LeadsFilter): Prisma.MgrLeadWhereInput {
  if (filter === "converted") return { status: "converted" };
  if (filter === "rejected") return { status: "rejected" };
  if (filter === "all") return {};
  return { status: { in: ["new", "contacted"] } }; // active (default)
}

export function buildLeadsWhere(
  params: BuildLeadsWhereParams,
): Prisma.MgrLeadWhereInput {
  const filter = normalizeLeadsFilter(params.filter);
  const where: Prisma.MgrLeadWhereInput = statusWhere(filter);

  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }

  const city = params.city?.trim();
  if (city) where.city = city;

  const source = params.source?.trim();
  if (source) where.source = source;

  const gte = parseDayStart(params.from);
  const lte = parseDayEnd(params.to);
  if (gte || lte) {
    const range: Prisma.DateTimeFilter = {};
    if (gte) range.gte = gte;
    if (lte) range.lte = lte;
    where.createdAt = range;
  }

  return where;
}
