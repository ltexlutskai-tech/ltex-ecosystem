// Pure URL ↔ filter state mapping (M1.3e; спрощено — прибрано частину фільтрів).
// Тримаємо все у одному місці щоб однакову логіку могли використати:
// (а) toolbar/filter-sheet — UI читання+запис URL,
// (б) page.tsx server — конверт у params для loadClients,
// (в) тести — без mocking.

export interface FilterState {
  // search
  search?: string;

  // multi-select FK (CSV)
  statusGeneralIds?: string[];
  statusOperationalIds?: string[];
  searchChannelIds?: string[];
  deliveryMethodIds?: string[];
  categoryTTIds?: string[];
  priceTypeIds?: string[];
  primaryAssortmentIds?: string[];
  primaryRouteIds?: string[];
  agentUserIds?: string[];

  // Область/Місто — вибір значень з довідника (не вільний текст).
  regionValues?: string[];
  cityValues?: string[];

  // numeric range
  daysSinceMin?: number;
  daysSinceMax?: number;

  // date
  createdFrom?: string;
  createdTo?: string;

  // Блок «Список клієнтів» (2026-07-16)
  /** Пошук по історії роботи (timeline). */
  historySearch?: string;
  /** Ключові слова (теги) — список слів. */
  keywords?: string[];
  /** Режим збігу тегів: усі (AND) чи будь-яке (OR). */
  keywordsOr?: boolean;
  /** Пошук по асортименту (артикул/назва товару). */
  assortmentSearch?: string;
  /** Кольори-пріоритети (світлофор): green|today|week|fortnight|stale|never. */
  colors?: string[];

  // bool
  hasDebt?: boolean;
  hasOverpayment?: boolean;
  onlyMine?: boolean;
  hideTrash?: boolean;
}

// URL → params: підтримує old (M1.3a single ?status=code) + new (?statusId=a,b,c)
export function urlToState(sp: URLSearchParams): FilterState {
  return {
    search: pickStr(sp.get("search")),

    statusGeneralIds: parseCsv(sp.get("statusId")),
    statusOperationalIds: parseCsv(sp.get("statusOperationalId")),
    searchChannelIds: parseCsv(sp.get("channelId")),
    deliveryMethodIds: parseCsv(sp.get("deliveryMethodId")),
    categoryTTIds: parseCsv(sp.get("categoryTTId")),
    priceTypeIds: parseCsv(sp.get("priceTypeId")),
    primaryAssortmentIds: parseCsv(sp.get("primaryAssortmentId")),
    primaryRouteIds: parseCsv(sp.get("primaryRouteId")),
    agentUserIds: parseCsv(sp.get("agentUserId")),

    regionValues: parseCsv(sp.get("region")),
    cityValues: parseCsv(sp.get("city")),

    daysSinceMin: parseInt2(sp.get("daysSinceMin")),
    daysSinceMax: parseInt2(sp.get("daysSinceMax")),

    createdFrom: pickStr(sp.get("createdFrom")),
    createdTo: pickStr(sp.get("createdTo")),

    historySearch: pickStr(sp.get("historySearch")),
    keywords: parseCsv(sp.get("keywords")),
    keywordsOr: parseBool(sp.get("keywordsOr")),
    assortmentSearch: pickStr(sp.get("assortmentSearch")),
    colors: parseCsv(sp.get("colors")),

    hasDebt: parseBool(sp.get("hasDebt")),
    hasOverpayment: parseBool(sp.get("hasOverpayment")),
    onlyMine: parseBool(sp.get("onlyMine")),
    hideTrash: parseBool(sp.get("hideTrash")),
  };
}

// State → URLSearchParams. Тільки defined значення піде у URL.
export function stateToUrl(
  state: FilterState,
  base?: URLSearchParams,
): URLSearchParams {
  const sp = base
    ? new URLSearchParams(base.toString())
    : new URLSearchParams();

  setStr(sp, "search", state.search);

  setCsv(sp, "statusId", state.statusGeneralIds);
  setCsv(sp, "statusOperationalId", state.statusOperationalIds);
  setCsv(sp, "channelId", state.searchChannelIds);
  setCsv(sp, "deliveryMethodId", state.deliveryMethodIds);
  setCsv(sp, "categoryTTId", state.categoryTTIds);
  setCsv(sp, "priceTypeId", state.priceTypeIds);
  setCsv(sp, "primaryAssortmentId", state.primaryAssortmentIds);
  setCsv(sp, "primaryRouteId", state.primaryRouteIds);
  setCsv(sp, "agentUserId", state.agentUserIds);

  setCsv(sp, "region", state.regionValues);
  setCsv(sp, "city", state.cityValues);

  setNum(sp, "daysSinceMin", state.daysSinceMin);
  setNum(sp, "daysSinceMax", state.daysSinceMax);

  setStr(sp, "createdFrom", state.createdFrom);
  setStr(sp, "createdTo", state.createdTo);

  setStr(sp, "historySearch", state.historySearch);
  setCsv(sp, "keywords", state.keywords);
  setBool(sp, "keywordsOr", state.keywordsOr);
  setStr(sp, "assortmentSearch", state.assortmentSearch);
  setCsv(sp, "colors", state.colors);

  setBool(sp, "hasDebt", state.hasDebt);
  setBool(sp, "hasOverpayment", state.hasOverpayment);
  setBool(sp, "onlyMine", state.onlyMine);
  setBool(sp, "hideTrash", state.hideTrash);

  return sp;
}

// Підраховує кількість активних "груп" фільтрів для бейджа "Фільтри (N)".
// Range (min+max) рахується як 1. Search НЕ враховується (на toolbar окремо).
// Bool legacy (hasDebt/hasOverpayment) теж 1 за активний.
export function countActiveFilters(state: FilterState): number {
  let count = 0;

  for (const arr of [
    state.statusGeneralIds,
    state.statusOperationalIds,
    state.searchChannelIds,
    state.deliveryMethodIds,
    state.categoryTTIds,
    state.priceTypeIds,
    state.primaryAssortmentIds,
    state.primaryRouteIds,
    state.agentUserIds,
    state.regionValues,
    state.cityValues,
    state.keywords,
    state.colors,
  ]) {
    if (arr && arr.length > 0) count += 1;
  }

  if (state.historySearch) count += 1;
  if (state.assortmentSearch) count += 1;

  // Range pairs — кожна група рахується як 1 якщо хоч одна з пари виставлена.
  for (const [a, b] of [[state.daysSinceMin, state.daysSinceMax]]) {
    if (a !== undefined || b !== undefined) count += 1;
  }

  if (state.createdFrom || state.createdTo) count += 1;

  if (state.hasDebt) count += 1;
  if (state.hasOverpayment) count += 1;
  // onlyMine + hideTrash — НЕ враховуємо в "Фільтри (N)" бо вони
  // окремо на toolbar / під toolbar.

  return count;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function pickStr(v: string | null): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function parseCsv(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const arr = v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return arr.length > 0 ? arr : undefined;
}

function parseInt2(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(v: string | null): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function setStr(sp: URLSearchParams, name: string, v: string | undefined) {
  if (v && v.length > 0) sp.set(name, v);
  else sp.delete(name);
}

function setCsv(sp: URLSearchParams, name: string, v: string[] | undefined) {
  if (v && v.length > 0) sp.set(name, v.join(","));
  else sp.delete(name);
}

function setNum(sp: URLSearchParams, name: string, v: number | undefined) {
  if (v !== undefined && Number.isFinite(v)) sp.set(name, String(v));
  else sp.delete(name);
}

function setBool(sp: URLSearchParams, name: string, v: boolean | undefined) {
  if (v === true) sp.set(name, "true");
  else if (v === false) sp.set(name, "false");
  else sp.delete(name);
}
