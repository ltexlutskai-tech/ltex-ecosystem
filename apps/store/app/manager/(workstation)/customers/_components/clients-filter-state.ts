// Pure URL ↔ filter state mapping (M1.3e).
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

  // text LIKE
  region?: string;
  city?: string;
  dialogStatus?: string;

  // numeric range
  debtMin?: number;
  debtMax?: number;
  overdueDebtMin?: number;
  overdueDebtMax?: number;
  monthlyVolumeMin?: number;
  monthlyVolumeMax?: number;
  daysSinceMin?: number;
  daysSinceMax?: number;

  // date
  licenseExpiresBefore?: string; // ISO date string (YYYY-MM-DD)
  createdFrom?: string;
  createdTo?: string;

  // bool
  hasNewMessage?: boolean;
  isViberLinked?: boolean;
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

    region: pickStr(sp.get("region")),
    city: pickStr(sp.get("city")),
    dialogStatus: pickStr(sp.get("dialogStatus")),

    debtMin: parseNum(sp.get("debtMin")),
    debtMax: parseNum(sp.get("debtMax")),
    overdueDebtMin: parseNum(sp.get("overdueDebtMin")),
    overdueDebtMax: parseNum(sp.get("overdueDebtMax")),
    monthlyVolumeMin: parseNum(sp.get("monthlyVolumeMin")),
    monthlyVolumeMax: parseNum(sp.get("monthlyVolumeMax")),
    daysSinceMin: parseInt2(sp.get("daysSinceMin")),
    daysSinceMax: parseInt2(sp.get("daysSinceMax")),

    licenseExpiresBefore: pickStr(sp.get("licenseExpiresBefore")),
    createdFrom: pickStr(sp.get("createdFrom")),
    createdTo: pickStr(sp.get("createdTo")),

    hasNewMessage: parseBool(sp.get("hasNewMessage")),
    isViberLinked: parseBool(sp.get("isViberLinked")),
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

  setStr(sp, "region", state.region);
  setStr(sp, "city", state.city);
  setStr(sp, "dialogStatus", state.dialogStatus);

  setNum(sp, "debtMin", state.debtMin);
  setNum(sp, "debtMax", state.debtMax);
  setNum(sp, "overdueDebtMin", state.overdueDebtMin);
  setNum(sp, "overdueDebtMax", state.overdueDebtMax);
  setNum(sp, "monthlyVolumeMin", state.monthlyVolumeMin);
  setNum(sp, "monthlyVolumeMax", state.monthlyVolumeMax);
  setNum(sp, "daysSinceMin", state.daysSinceMin);
  setNum(sp, "daysSinceMax", state.daysSinceMax);

  setStr(sp, "licenseExpiresBefore", state.licenseExpiresBefore);
  setStr(sp, "createdFrom", state.createdFrom);
  setStr(sp, "createdTo", state.createdTo);

  setBool(sp, "hasNewMessage", state.hasNewMessage);
  setBool(sp, "isViberLinked", state.isViberLinked);
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
  ]) {
    if (arr && arr.length > 0) count += 1;
  }

  for (const s of [state.region, state.city, state.dialogStatus]) {
    if (s && s.length > 0) count += 1;
  }

  // Range pairs — кожна група рахується як 1 якщо хоч одна з пари виставлена.
  for (const [a, b] of [
    [state.debtMin, state.debtMax],
    [state.overdueDebtMin, state.overdueDebtMax],
    [state.monthlyVolumeMin, state.monthlyVolumeMax],
    [state.daysSinceMin, state.daysSinceMax],
  ]) {
    if (a !== undefined || b !== undefined) count += 1;
  }

  if (state.licenseExpiresBefore) count += 1;
  if (state.createdFrom || state.createdTo) count += 1;

  if (state.hasNewMessage !== undefined) count += 1;
  if (state.isViberLinked !== undefined) count += 1;
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

function parseNum(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
