/**
 * Спільні чисті хелпери для переглядачів регістрів-оборотів
 * (`/manager/registry/{sales,cashflow,stock,orders}`).
 *
 * Період → Prisma DateTimeFilter (від/по, кінець дня включно), формат сум/дат.
 */

/** Безпечний парс `YYYY-MM-DD` → Date | undefined. */
export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface OccurredAtFilter {
  gte?: Date;
  lte?: Date;
}

/** Будує фільтр періоду по `occurredAt` (кінець дня `to` включно). */
export function buildOccurredAtFilter(
  from?: string,
  to?: string,
): OccurredAtFilter | undefined {
  const gte = parseDateParam(from);
  const toDate = parseDateParam(to);
  if (!gte && !toDate) return undefined;
  const f: OccurredAtFilter = {};
  if (gte) f.gte = gte;
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    f.lte = end;
  }
  return f;
}

/** Decimal | number → number. */
export function toNum(v: { toString(): string } | number | null): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v.toString());
}

/** EUR-форматування для CSV/UI (2 знаки, крапка). */
export function fmtEur(n: number): string {
  return n.toFixed(2);
}

/** Кг-форматування (3 знаки). */
export function fmtKg(n: number): string {
  return n.toFixed(3);
}

/** Дата → `YYYY-MM-DD HH:mm`. */
export function fmtDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Дата → `YYYY-MM-DD`. */
export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
