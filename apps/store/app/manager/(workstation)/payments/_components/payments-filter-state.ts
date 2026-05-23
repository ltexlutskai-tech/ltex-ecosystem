/**
 * Блок «Оплати / Каса» — Етап 1. URL-стан списку касових ордерів.
 *
 * Дзеркалить `sales-filter-state.ts`:
 *  • `type` — вид руху (income/expense) або «» (усі);
 *  • `archived` — показувати архівні (дефолт false — приховані);
 *  • `search` (№ / клієнт), `from`/`to` (період `paidAt`), пагінація.
 */

export type CashOrderType = "income" | "expense";

export interface PaymentsFilterState {
  search: string;
  type: CashOrderType | "";
  /** Показувати архівні. Дефолт false — архівні приховані. */
  archived: boolean;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

const TYPE_SET = new Set<string>(["income", "expense"]);

function pickString(
  v: string | string[] | undefined,
  trim = true,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  if (typeof v !== "string") return undefined;
  const out = trim ? v.trim() : v;
  return out.length > 0 ? out : undefined;
}

export function parsePaymentsFilterFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): PaymentsFilterState {
  const search = pickString(sp.search) ?? "";
  const typeRaw = pickString(sp.type) ?? "";
  const type: CashOrderType | "" = TYPE_SET.has(typeRaw)
    ? (typeRaw as CashOrderType)
    : "";

  const archived = pickString(sp.archived) === "true";
  const from = pickString(sp.from) ?? "";
  const to = pickString(sp.to) ?? "";

  const pageNum = Number.parseInt(pickString(sp.page) ?? "", 10);
  const pageSizeNum = Number.parseInt(pickString(sp.pageSize) ?? "", 10);

  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum >= 10 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;

  return { search, type, archived, from, to, page, pageSize };
}

export function paymentsFilterToQueryString(
  state: Partial<PaymentsFilterState>,
): string {
  const sp = new URLSearchParams();
  if (state.search) sp.set("search", state.search);
  if (state.type) sp.set("type", state.type);
  if (state.archived) sp.set("archived", "true");
  if (state.from) sp.set("from", state.from);
  if (state.to) sp.set("to", state.to);
  if (state.page && state.page > 1) sp.set("page", String(state.page));
  if (state.pageSize && state.pageSize !== 20) {
    sp.set("pageSize", String(state.pageSize));
  }
  return sp.toString();
}
