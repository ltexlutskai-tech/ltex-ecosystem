import {
  ORDER_STATUS_LIST,
  type OrderStatus,
} from "@/lib/manager/order-status";

export const ORDER_SORT_KEYS = [
  "date",
  "sum",
  "code",
  "client",
  "city",
  "status",
  "positions",
  "actual",
  "agent",
  "delivery",
] as const;

export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];

export const ORDER_ACTUALITY_VALUES = ["actual", "inactive", "all"] as const;
export type OrderActualityValue = (typeof ORDER_ACTUALITY_VALUES)[number];

export const ORDER_SOURCE_VALUES = ["", "site", "manual"] as const;
export type OrderSourceValue = (typeof ORDER_SOURCE_VALUES)[number];

export interface OrdersFilterState {
  search: string;
  status: OrderStatus | "";
  /** Актуальність документа. Дефолт «actual» — лише актуальні. */
  actuality: OrderActualityValue;
  /** Джерело замовлення. Дефолт "" — усі. */
  source: OrderSourceValue;
  from: string;
  to: string;
  clientCode1C: string;
  /** Per-column фільтр по клієнту (текст). */
  clientName: string;
  /** Per-column фільтр по місту (текст). */
  city: string;
  /** Per-column фільтр по агенту (текст). */
  agent: string;
  /** Показувати архівні (проведені в 1С). Дефолт false — архівні приховані. */
  showArchived: boolean;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
}

const ORDER_STATUS_SET = new Set<string>(ORDER_STATUS_LIST);
const ORDER_SORT_KEY_SET = new Set<string>(ORDER_SORT_KEYS);
const ORDER_ACTUALITY_SET = new Set<string>(ORDER_ACTUALITY_VALUES);
const ORDER_SOURCE_SET = new Set<string>(ORDER_SOURCE_VALUES);

function pickString(
  v: string | string[] | undefined,
  trim = true,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v !== "string") return undefined;
  const out = trim ? v.trim() : v;
  return out.length > 0 ? out : undefined;
}

export function parseOrdersFilterFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): OrdersFilterState {
  const search = pickString(sp.search) ?? "";
  const statusRaw = pickString(sp.status) ?? "";
  const status: OrderStatus | "" = ORDER_STATUS_SET.has(statusRaw)
    ? (statusRaw as OrderStatus)
    : "";

  const actualityRaw = pickString(sp.actuality) ?? "";
  const actuality: OrderActualityValue = ORDER_ACTUALITY_SET.has(actualityRaw)
    ? (actualityRaw as OrderActualityValue)
    : "actual";

  const sourceRaw = pickString(sp.source) ?? "";
  const source: OrderSourceValue = ORDER_SOURCE_SET.has(sourceRaw)
    ? (sourceRaw as OrderSourceValue)
    : "";

  const from = pickString(sp.from) ?? "";
  const to = pickString(sp.to) ?? "";
  const clientCode1C = pickString(sp.clientCode1C) ?? "";
  const clientName = pickString(sp.clientName) ?? "";
  const city = pickString(sp.city) ?? "";
  const agent = pickString(sp.agent) ?? "";
  const showArchived = pickString(sp.showArchived) === "true";

  const pageStr = pickString(sp.page) ?? "";
  const pageSizeStr = pickString(sp.pageSize) ?? "";
  const pageNum = Number.parseInt(pageStr, 10);
  const pageSizeNum = Number.parseInt(pageSizeStr, 10);

  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum >= 10 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;

  const sortRaw = pickString(sp.sort) ?? "";
  const sort = ORDER_SORT_KEY_SET.has(sortRaw) ? sortRaw : "date";

  const dirRaw = pickString(sp.dir) ?? "";
  const dir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";

  return {
    search,
    status,
    actuality,
    source,
    from,
    to,
    clientCode1C,
    clientName,
    city,
    agent,
    showArchived,
    page,
    pageSize,
    sort,
    dir,
  };
}

export function ordersFilterToQueryString(
  state: Partial<OrdersFilterState>,
): string {
  const sp = new URLSearchParams();
  if (state.search) sp.set("search", state.search);
  if (state.status) sp.set("status", state.status);
  if (state.actuality && state.actuality !== "actual") {
    sp.set("actuality", state.actuality);
  }
  if (state.source) sp.set("source", state.source);
  if (state.from) sp.set("from", state.from);
  if (state.to) sp.set("to", state.to);
  if (state.clientCode1C) sp.set("clientCode1C", state.clientCode1C);
  if (state.clientName) sp.set("clientName", state.clientName);
  if (state.city) sp.set("city", state.city);
  if (state.agent) sp.set("agent", state.agent);
  if (state.showArchived) sp.set("showArchived", "true");
  if (state.page && state.page > 1) sp.set("page", String(state.page));
  if (state.pageSize && state.pageSize !== 20) {
    sp.set("pageSize", String(state.pageSize));
  }
  if (state.sort !== undefined || state.dir !== undefined) {
    const sort = state.sort ?? "date";
    const dir = state.dir ?? "desc";
    if (sort !== "date" || dir !== "desc") {
      sp.set("sort", sort);
      sp.set("dir", dir);
    }
  }
  return sp.toString();
}

export function isValidIsoDate(raw: string): boolean {
  if (!raw) return false;
  const d = new Date(raw);
  return !Number.isNaN(d.getTime());
}
