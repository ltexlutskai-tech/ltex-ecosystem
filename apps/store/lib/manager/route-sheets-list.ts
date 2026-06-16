import { Prisma } from "@ltex/db";
import {
  ROUTE_SHEET_STATUS_LIST,
  type RouteSheetStatus,
} from "@/lib/manager/route-sheet-status";

/**
 * Блок «Маршрутний лист» — Етап 1 (список) where-builder.
 *
 * Чиста (DB-agnostic) функція: будує Prisma `where` для списку маршрутних
 * листів (1С ФормаСписка МаршрутныйЛист).
 *
 * Особливості 1С-екрана:
 *  • за замовчуванням **архівні приховані** (`archived = true`); чекбокс
 *    «Відображати архівні» (`showArchived`) знімає це обмеження;
 *  • **пошук** матчить № документа (`docNumber`/`code1C`) АБО назву маршруту
 *    (`comment` — у 1С документ = `Комментарий`);
 *  • період — по полю `date` (дата складання документа).
 *
 * **Ownership:** маршрутний лист — спільний диспетчерський документ, його
 * бачать усі менеджери + admin (НЕ скоупиться по клієнту). Тому where-builder
 * не приймає ownership-скоуп (на відміну від `sales-list`/`orders-list`).
 */

const ROUTE_SHEET_STATUS_SET = new Set<string>(ROUTE_SHEET_STATUS_LIST);

/** Нормалізує сирий статус у allow-list або `""` (ігнорувати). */
export function normalizeRouteSheetStatus(
  raw: string | undefined,
): RouteSheetStatus | "" {
  const v = (raw ?? "").trim();
  return ROUTE_SHEET_STATUS_SET.has(v) ? (v as RouteSheetStatus) : "";
}

export interface BuildRouteSheetsWhereParams {
  /** Пошук: № документа / коментар / назва маршруту. */
  search?: string;
  /** Статус документа (вже нормалізований allow-list-ом). */
  status?: RouteSheetStatus | "";
  /** Період складання (поле `date`). */
  from?: Date;
  to?: Date;
  /**
   * Показувати архівні. За замовчуванням `false` —
   * архівні (`archived = true`) приховані.
   */
  archived?: boolean;
}

/**
 * Будує `where` для `prisma.routeSheet.findMany` / `.count`. Чиста функція — без I/O.
 */
export function buildRouteSheetsWhere(
  p: BuildRouteSheetsWhereParams,
): Prisma.RouteSheetWhereInput {
  const where: Prisma.RouteSheetWhereInput = {};

  // Архів: за замовчуванням приховуємо архівні.
  if (!p.archived) {
    where.archived = false;
  }

  // Пошук: № документа / назва маршруту (= `comment`).
  if (p.search && p.search.trim().length > 0) {
    const q = p.search.trim();
    const or: Prisma.RouteSheetWhereInput[] = [
      { number1C: { contains: q, mode: "insensitive" } },
      { code1C: { contains: q, mode: "insensitive" } },
      { comment: { contains: q, mode: "insensitive" } },
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
    where.date = {
      ...(p.from ? { gte: p.from } : {}),
      ...(p.to ? { lte: p.to } : {}),
    };
  }

  return where;
}

// ─── Серіалізація рядка списку ──────────────────────────────────────────────

export interface RawRouteSheetRow {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  date: Date;
  arrivalDate: Date | null;
  status: string;
  totalUah: number;
  totalEur: number;
  archived: boolean;
  /** Назва маршруту — вільний текст (1С: документ = `Комментарий`). */
  comment: string | null;
  expeditor: { id: string; fullName: string } | null;
  _count: { orders: number };
}

export interface RouteSheetListItem {
  id: string;
  code1C: string | null;
  number1C: string | null;
  docNumber: number;
  date: Date;
  arrivalDate: Date | null;
  status: string;
  totalUah: number;
  totalEur: number;
  archived: boolean;
  orderCount: number;
  /** Назва маршруту для колонки «Маршрут» (= `comment`). */
  routeName: string | null;
  expeditor: { id: string; fullName: string } | null;
}

/** Prisma include для рядка списку — узгоджено з RawRouteSheetRow. */
export const routeSheetRowInclude = {
  expeditor: { select: { id: true, fullName: true } },
  _count: { select: { orders: true } },
} satisfies Prisma.RouteSheetInclude;

/** Перетворює raw-маршрутний-лист у плаский рядок списку. Чиста функція — без I/O. */
export function serializeRouteSheetRow(
  r: RawRouteSheetRow,
): RouteSheetListItem {
  return {
    id: r.id,
    code1C: r.code1C,
    number1C: r.number1C,
    docNumber: r.docNumber,
    date: r.date,
    arrivalDate: r.arrivalDate,
    status: r.status,
    totalUah: r.totalUah,
    totalEur: r.totalEur,
    archived: r.archived,
    orderCount: r._count.orders,
    routeName: r.comment,
    expeditor: r.expeditor
      ? { id: r.expeditor.id, fullName: r.expeditor.fullName }
      : null,
  };
}
