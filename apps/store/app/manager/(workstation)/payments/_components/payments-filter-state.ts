/**
 * Блок «Оплати / Каса» — Етап 1. URL-стан списку касових ордерів.
 *
 * Дзеркалить `sales-filter-state.ts`:
 *  • `type` — вид руху (income/expense) або «» (усі);
 *  • `archived` — показувати архівні (дефолт false — приховані);
 *  • `search` (№ / клієнт), `from`/`to` (період `paidAt`), пагінація;
 *  • `sort`/`dir` — сортування по колонці (дефолт `date`/`desc`);
 *  • per-column фільтри `client`/`article`/`account` (текст, LIKE).
 */

export type CashOrderType = "income" | "expense";

export const PAYMENT_SORT_KEYS = [
  "date",
  "code",
  "type",
  "client",
  "article",
  "account",
  "sum",
] as const;

export type PaymentSortKey = (typeof PAYMENT_SORT_KEYS)[number];

export interface PaymentsFilterState {
  search: string;
  type: CashOrderType | "";
  /** Показувати архівні. Дефолт false — архівні приховані. */
  archived: boolean;
  from: string;
  to: string;
  /** Per-column фільтр по клієнту (текст, LIKE). */
  client: string;
  /** Per-column фільтр по статті руху коштів (текст, LIKE). */
  article: string;
  /** Per-column фільтр по банк-рахунку (текст, LIKE). */
  account: string;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
}

const TYPE_SET = new Set<string>(["income", "expense"]);
const PAYMENT_SORT_KEY_SET = new Set<string>(PAYMENT_SORT_KEYS);

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
  const client = pickString(sp.client) ?? "";
  const article = pickString(sp.article) ?? "";
  const account = pickString(sp.account) ?? "";

  const pageNum = Number.parseInt(pickString(sp.page) ?? "", 10);
  const pageSizeNum = Number.parseInt(pickString(sp.pageSize) ?? "", 10);

  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize =
    Number.isFinite(pageSizeNum) && pageSizeNum >= 10 && pageSizeNum <= 100
      ? pageSizeNum
      : 20;

  const sortRaw = pickString(sp.sort) ?? "";
  const sort = PAYMENT_SORT_KEY_SET.has(sortRaw) ? sortRaw : "date";

  const dirRaw = pickString(sp.dir) ?? "";
  const dir: "asc" | "desc" = dirRaw === "asc" ? "asc" : "desc";

  return {
    search,
    type,
    archived,
    from,
    to,
    client,
    article,
    account,
    page,
    pageSize,
    sort,
    dir,
  };
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
  if (state.client) sp.set("client", state.client);
  if (state.article) sp.set("article", state.article);
  if (state.account) sp.set("account", state.account);
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
