/**
 * Хелпери переглядачів дрібних/службових регістрів (Фаза 8):
 *   - Норми запасів (StockNorm)
 *   - Історія статусів клієнтів (ClientStatusHistory)
 *   - Статус дня агента (AgentDayLog)
 *
 * Чисті функції (where-білдери + мапери рядків) — щоб покрити юніт-тестами без БД.
 * Сторінки під `/manager/registry/*` читають Prisma і передають результат у
 * спільний `RegisterViewer`.
 */

/** ISO-дата → ДД.ММ.РРРР (uk-UA). Порожнє для невалідного входу. */
export function formatRegDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** ISO → ДД.ММ.РРРР ГГ:ХХ (для подій із часом, напр. тайм-трекінг). */
export function formatRegDateTime(
  value: Date | string | null | undefined,
): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Норми запасів ───────────────────────────────────────────────────────────

export interface StockNormFilters {
  q?: string;
}

export function buildStockNormWhere(
  f: StockNormFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const q = f.q?.trim();
  if (q) {
    where.productCode1C = { contains: q };
  }
  return where;
}

export interface StockNormRow {
  id: string;
  productCode1C: string;
  warehouseCode1C: string;
  norm: string;
  setAt: string;
}

export function mapStockNormToRow(m: {
  id: string;
  productCode1C: string;
  warehouseCode1C: string | null;
  norm: { toString(): string } | number;
  setAt: Date;
}): StockNormRow {
  return {
    id: m.id,
    productCode1C: m.productCode1C,
    warehouseCode1C: m.warehouseCode1C ?? "—",
    norm: typeof m.norm === "number" ? String(m.norm) : m.norm.toString(),
    setAt: m.setAt.toISOString(),
  };
}

// ─── Історія статусів клієнтів ───────────────────────────────────────────────

export interface StatusHistoryFilters {
  q?: string;
  from?: string;
  to?: string;
}

export function buildStatusHistoryWhere(
  f: StatusHistoryFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const q = f.q?.trim();
  if (q) where.clientCode1C = { contains: q };

  const range: Record<string, Date> = {};
  const from = parseDay(f.from);
  const to = parseDay(f.to);
  if (from) range.gte = from;
  if (to) {
    // включно по кінець доби `to`
    to.setHours(23, 59, 59, 999);
    range.lte = to;
  }
  if (Object.keys(range).length > 0) where.changedAt = range;
  return where;
}

export interface StatusHistoryRow {
  id: string;
  clientCode1C: string;
  statusCode1C: string;
  operationalStatus: string;
  changedAt: string;
}

export function mapStatusHistoryToRow(m: {
  id: string;
  clientCode1C: string;
  statusCode1C: string | null;
  operationalStatus: string | null;
  changedAt: Date;
}): StatusHistoryRow {
  return {
    id: m.id,
    clientCode1C: m.clientCode1C,
    statusCode1C: m.statusCode1C ?? "—",
    operationalStatus: m.operationalStatus ?? "—",
    changedAt: m.changedAt.toISOString(),
  };
}

// ─── Статус дня агента (тайм-трекінг) ────────────────────────────────────────

export interface DayLogFilters {
  q?: string;
  kind?: string; // "start" | "end"
  from?: string;
  to?: string;
}

export function buildDayLogWhere(f: DayLogFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const q = f.q?.trim();
  if (q) where.code1C = { contains: q };
  if (f.kind === "start" || f.kind === "end") where.kind = f.kind;

  const range: Record<string, Date> = {};
  const from = parseDay(f.from);
  const to = parseDay(f.to);
  if (from) range.gte = from;
  if (to) range.lte = to;
  if (Object.keys(range).length > 0) where.date = range;
  return where;
}

/** Локалізована назва події дня. */
export function dayLogKindLabel(kind: string): string {
  if (kind === "start") return "Початок дня";
  if (kind === "end") return "Кінець дня";
  return kind;
}

export interface DayLogRow {
  id: string;
  agentName: string;
  kindLabel: string;
  at: string;
  date: string;
  note: string;
}

export function mapDayLogToRow(
  m: {
    id: string;
    userId: string | null;
    code1C: string | null;
    kind: string;
    at: Date;
    date: Date;
    note: string | null;
  },
  agentNameById: Map<string, string>,
): DayLogRow {
  const name = m.userId ? agentNameById.get(m.userId) : null;
  return {
    id: m.id,
    agentName: name ?? m.code1C ?? "—",
    kindLabel: dayLogKindLabel(m.kind),
    at: m.at.toISOString(),
    date: m.date.toISOString(),
    note: m.note ?? "",
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
