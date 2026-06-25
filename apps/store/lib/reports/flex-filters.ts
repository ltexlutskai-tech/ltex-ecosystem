/**
 * Спільна логіка «Відборів» (filters) для гнучких звітів — у стилі 1С «Відбір»:
 * кожен відбір = вимір + ВИД ПОРІВНЯННЯ + значення. Застосовується на
 * резолвленому підписі (label) виміру, регістронезалежно.
 *
 * Використовується усіма 4 гнучкими звітами (продажі / маржа / ДДС / залишки):
 *   - `parseFilters` читає `f_<dim>` (значення) + `fop_<dim>` (вид порівняння).
 *   - `applyRowFilters` фільтрує нормалізовані рядки за резолвленим label.
 *
 * Back-compat: старі URL з голим `f_<dim>` (без `fop_`) трактуються як
 * «містить» (contains).
 */

import type { NormalizedRow } from "@/lib/reports/sales-flex";

/** Види порівняння (1С: «Вид сравнения»). */
export type FilterOp =
  | "contains"
  | "eq"
  | "ne"
  | "in"
  | "nin"
  | "filled"
  | "empty";

/** Перелік видів порівняння з підписами для UI-дропдауна. */
export const FILTER_OPS: { value: FilterOp; label: string }[] = [
  { value: "contains", label: "містить" },
  { value: "eq", label: "дорівнює" },
  { value: "ne", label: "не дорівнює" },
  { value: "in", label: "у списку" },
  { value: "nin", label: "не у списку" },
  { value: "filled", label: "заповнено" },
  { value: "empty", label: "не заповнено" },
];

const OP_SET = new Set<FilterOp>(FILTER_OPS.map((o) => o.value));

/** Розпарсений відбір (вимір + вид порівняння + значення). */
export interface ParsedFilter {
  dim: string;
  op: FilterOp;
  value: string;
}

/** Види порівняння, що НЕ потребують значення. */
function isValuelessOp(op: FilterOp): boolean {
  return op === "filled" || op === "empty";
}

/**
 * Читає відбори з URL-параметрів для заданих ключів вимірів.
 *   `f_<dim>`   — значення
 *   `fop_<dim>` — вид порівняння (дефолт «contains»)
 * Відбір пропускається, коли значення порожнє І вид НЕ ∈ {filled, empty}.
 */
export function parseFilters(
  params: URLSearchParams,
  dimKeys: string[],
): ParsedFilter[] {
  const out: ParsedFilter[] = [];
  for (const dim of dimKeys) {
    const rawValue = params.get(`f_${dim}`) ?? "";
    const value = rawValue.trim();
    const rawOp = params.get(`fop_${dim}`) ?? "contains";
    const op: FilterOp = OP_SET.has(rawOp as FilterOp)
      ? (rawOp as FilterOp)
      : "contains";
    if (!value && !isValuelessOp(op)) continue;
    out.push({ dim, op, value });
  }
  return out;
}

/** Чи вважається label «порожнім» для filled/empty (—, «Без …»). */
function isBlankLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return true;
  if (t === "—") return true;
  if (t.startsWith("Без ")) return true;
  return false;
}

/** Розбиває CSV-значення у список ненульових trim-ованих елементів (lowercase). */
function parseList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Перевіряє один відбір проти резолвленого label. */
function matchOne(label: string, f: ParsedFilter): boolean {
  const l = label.trim().toLowerCase();
  switch (f.op) {
    case "contains":
      return l.includes(f.value.toLowerCase());
    case "eq":
      return l === f.value.trim().toLowerCase();
    case "ne":
      return l !== f.value.trim().toLowerCase();
    case "in": {
      const list = parseList(f.value);
      return list.includes(l);
    }
    case "nin": {
      const list = parseList(f.value);
      return !list.includes(l);
    }
    case "filled":
      return !isBlankLabel(label);
    case "empty":
      return isBlankLabel(label);
    default:
      return true;
  }
}

/**
 * Застосовує усі відбори (логічне «І») до рядків за резолвленим підписом виміру.
 *
 * @param rows     нормалізовані рядки
 * @param filters  розпарсені відбори
 * @param getLabel резолвер label рядка для виміру (зазвичай `row.dims[dim].label`)
 */
export function applyRowFilters(
  rows: NormalizedRow[],
  filters: ParsedFilter[],
  getLabel: (row: NormalizedRow, dim: string) => string,
): NormalizedRow[] {
  if (!filters.length) return rows;
  return rows.filter((r) =>
    filters.every((f) => matchOne(getLabel(r, f.dim) ?? "", f)),
  );
}

/** Максимум distinct-значень на вимір для combobox-відборів. */
export const FILTER_OPTIONS_CAP = 300;

/**
 * Збирає відсортовані DISTINCT-підписи (label) на вимір з нормалізованих рядків.
 * Якщо distinct-значень понад `FILTER_OPTIONS_CAP` — повертає [] для цього
 * виміру (UI показує лише вільний текст). Порожні / «—» підписи пропускаються.
 *
 * @param rows       рядки ДО застосування відборів
 * @param dimKeys    виміри, для яких збираємо значення
 * @param getLabel   резолвер label рядка для виміру
 */
export function collectFilterOptions(
  rows: NormalizedRow[],
  dimKeys: string[],
  getLabel: (row: NormalizedRow, dim: string) => string,
): Record<string, string[]> {
  const sets = new Map<string, Set<string>>();
  const overflow = new Set<string>();
  for (const dim of dimKeys) sets.set(dim, new Set());

  for (const r of rows) {
    for (const dim of dimKeys) {
      if (overflow.has(dim)) continue;
      const label = (getLabel(r, dim) ?? "").trim();
      if (!label || label === "—") continue;
      const set = sets.get(dim)!;
      set.add(label);
      if (set.size > FILTER_OPTIONS_CAP) overflow.add(dim);
    }
  }

  const out: Record<string, string[]> = {};
  for (const dim of dimKeys) {
    if (overflow.has(dim)) {
      out[dim] = [];
      continue;
    }
    out[dim] = [...sets.get(dim)!].sort((a, b) => a.localeCompare(b, "uk"));
  }
  return out;
}
