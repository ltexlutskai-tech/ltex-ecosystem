export const dynamic = "force-dynamic";

import Link from "next/link";
import { AdminBreadcrumbs } from "@/components/admin/breadcrumbs";
import { AdminPagination } from "@/components/admin/pagination";
import {
  listCustomers,
  getCustomerListSummary,
  CUSTOMER_LIST_PAGE_SIZE_DEFAULT,
  type CustomerListSort,
} from "@/lib/admin-customers";

const SORT_OPTIONS: { value: CustomerListSort; label: string }[] = [
  { value: "first_seen_desc", label: "Дата реєстрації (нові)" },
  { value: "last_order_desc", label: "Останнє замовлення" },
  { value: "orders_count_desc", label: "К-сть замовлень" },
  { value: "name_asc", label: "Ім'я (А→Я)" },
];

const VALID_SORTS = new Set(SORT_OPTIONS.map((o) => o.value));

function parseHasOrders(raw: string | undefined): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatUah(value: number): string {
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    hasOrders?: string;
  }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const sort: CustomerListSort = VALID_SORTS.has(
    params.sort as CustomerListSort,
  )
    ? (params.sort as CustomerListSort)
    : "first_seen_desc";
  const hasOrders = parseHasOrders(params.hasOrders);
  const pageSize = CUSTOMER_LIST_PAGE_SIZE_DEFAULT;

  const [{ items, total }, summary] = await Promise.all([
    listCustomers({
      search: query || undefined,
      hasOrders,
      sort,
      page,
      pageSize,
    }),
    getCustomerListSummary(query || undefined),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function buildHref(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (sort !== "first_seen_desc") sp.set("sort", sort);
    if (hasOrders === true) sp.set("hasOrders", "true");
    else if (hasOrders === false) sp.set("hasOrders", "false");
    if (page > 1) sp.set("page", String(page));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    const qs = sp.toString();
    return qs ? `/admin/customers?${qs}` : "/admin/customers";
  }

  function pageHref(p: number) {
    return buildHref({ page: p > 1 ? String(p) : undefined });
  }

  function exportHref(): string {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (sort !== "first_seen_desc") sp.set("sort", sort);
    if (hasOrders === true) sp.set("hasOrders", "true");
    else if (hasOrders === false) sp.set("hasOrders", "false");
    const qs = sp.toString();
    return qs ? `/admin/customers/export?${qs}` : "/admin/customers/export";
  }

  const filterTabs: {
    label: string;
    value: boolean | undefined;
    count: number;
  }[] = [
    { label: "Всі", value: undefined, count: summary.total },
    {
      label: "Покупці (з замовленнями)",
      value: true,
      count: summary.withOrders,
    },
    {
      label: "Ліди (без замовлень)",
      value: false,
      count: summary.leadsOnly,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminBreadcrumbs items={[{ label: "Клієнти" }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Клієнти</h1>
          <p className="mt-1 text-sm text-gray-500">
            Усього: <strong>{summary.total}</strong> · з замовленнями:{" "}
            <strong>{summary.withOrders}</strong> · ліди:{" "}
            <strong>{summary.leadsOnly}</strong>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <a
            href={exportHref()}
            className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Експорт CSV
          </a>
          {summary.total > 5000 && (
            <p className="max-w-xs text-right text-xs text-amber-700">
              Експорт обмежений 5000 рядками. Звузьте фільтри (пошук, наявність
              замовлень, сортування), щоб отримати потрібний зріз.
            </p>
          )}
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/admin/customers"
      >
        <input
          name="q"
          defaultValue={query}
          placeholder="Пошук по телефону, імені, email..."
          className="min-w-[220px] flex-1 rounded-md border px-3 py-2 text-sm"
        />
        {hasOrders === true && (
          <input type="hidden" name="hasOrders" value="true" />
        )}
        {hasOrders === false && (
          <input type="hidden" name="hasOrders" value="false" />
        )}
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-md border px-3 py-2 text-sm"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
        >
          Шукати
        </button>
        {(query || sort !== "first_seen_desc") && (
          <Link
            href={buildHref({ q: undefined, sort: undefined, page: undefined })}
            className="rounded-md border px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Скинути
          </Link>
        )}
      </form>

      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => {
          const active = hasOrders === tab.value;
          const href = buildHref({
            hasOrders:
              tab.value === undefined
                ? undefined
                : tab.value
                  ? "true"
                  : "false",
            page: undefined,
          });
          return (
            <Link
              key={tab.label}
              href={href}
              className={`rounded-md border px-3 py-1 text-sm ${
                active
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "hover:bg-gray-50"
              }`}
            >
              {tab.label} ({tab.count})
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Телефон</th>
              <th className="px-4 py-3 font-medium">Ім&apos;я</th>
              <th className="px-4 py-3 font-medium">Email · TG · Місто</th>
              <th className="px-4 py-3 font-medium">Перший візит</th>
              <th className="px-4 py-3 font-medium">Останнє замовлення</th>
              <th className="px-4 py-3 text-right font-medium">Замовлень</th>
              <th className="px-4 py-3 text-right font-medium">Сума UAH</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-gray-500"
                >
                  Клієнтів не знайдено
                </td>
              </tr>
            ) : (
              items.map((c) => {
                const contactBits = [c.email, c.telegram, c.city].filter(
                  (v): v is string => Boolean(v),
                );
                return (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {contactBits.length === 0 ? "—" : contactBits.join(" · ")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {formatDate(c.firstSeenAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {formatDateOnly(c.lastOrderAt)}
                    </td>
                    <td className="px-4 py-3 text-right">{c.ordersCount}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatUah(c.ordersTotalUah)} ₴
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        baseHref="/admin/customers"
        buildHref={pageHref}
      />
    </div>
  );
}
