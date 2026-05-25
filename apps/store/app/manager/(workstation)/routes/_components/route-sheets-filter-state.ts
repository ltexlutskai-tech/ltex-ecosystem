import {
  ROUTE_SHEET_STATUS_LIST,
  type RouteSheetStatus,
} from "@/lib/manager/route-sheet-status";

export interface RouteSheetsFilterState {
  search: string;
  status: RouteSheetStatus | "";
  from: string;
  to: string;
  /** Показувати архівні. Дефолт false — архівні приховані. */
  archived: boolean;
  page: number;
  pageSize: number;
}

const ROUTE_SHEET_STATUS_SET = new Set<string>(ROUTE_SHEET_STATUS_LIST);

function pickString(
  v: string | string[] | undefined,
  trim = true,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v !== "string") return undefined;
  const out = trim ? v.trim() : v;
  return out.length > 0 ? out : undefined;
}

export function parseRouteSheetsFilterFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): RouteSheetsFilterState {
  const search = pickString(sp.search) ?? "";
  const statusRaw = pickString(sp.status) ?? "";
  const status: RouteSheetStatus | "" = ROUTE_SHEET_STATUS_SET.has(statusRaw)
    ? (statusRaw as RouteSheetStatus)
    : "";

  const from = pickString(sp.from) ?? "";
  const to = pickString(sp.to) ?? "";
  const archived = pickString(sp.archived) === "true";

  const pageStr = pickString(sp.page) ?? "";
  const pageSizeStr = pickString(sp.pageSize) ?? "";
  const pageNum = Number.parseInt(pageStr, 10);
  const pageSizeNum = Number.parseInt(pageSizeStr, 10);

  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum >= 10 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;

  return { search, status, from, to, archived, page, pageSize };
}

export function routeSheetsFilterToQueryString(
  state: Partial<RouteSheetsFilterState>,
): string {
  const sp = new URLSearchParams();
  if (state.search) sp.set("search", state.search);
  if (state.status) sp.set("status", state.status);
  if (state.from) sp.set("from", state.from);
  if (state.to) sp.set("to", state.to);
  if (state.archived) sp.set("archived", "true");
  if (state.page && state.page > 1) sp.set("page", String(state.page));
  if (state.pageSize && state.pageSize !== 20) {
    sp.set("pageSize", String(state.pageSize));
  }
  return sp.toString();
}
