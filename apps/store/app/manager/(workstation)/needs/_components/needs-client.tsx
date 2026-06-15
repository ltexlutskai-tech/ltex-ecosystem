"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { buildCsv } from "@/lib/reports/csv-export";
import type { NeedsResult } from "@/lib/manager/needs";

type TabId = "products" | "orders" | "agents";

const TABS: { id: TabId; label: string }[] = [
  { id: "products", label: "Товари" },
  { id: "orders", label: "Замовлення" },
  { id: "agents", label: "Торгові агенти" },
];

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

/** Завантаження CSV у браузері (Товари) через спільний buildCsv (BOM + `;`). */
function downloadProductsCsv(data: NeedsResult): void {
  const headers = [
    "Артикул",
    "Номенклатура",
    "Од.",
    "Замовлено",
    "Остаток",
    "Потрібно",
  ];
  const rows = data.products.map((p) => [
    p.articleCode,
    p.name,
    p.unit,
    p.ordered,
    p.available,
    p.needed,
  ]);
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `potreby_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function NeedsClient({
  data,
  deficitOnly,
  city,
}: {
  data: NeedsResult;
  deficitOnly: boolean;
  city: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>("products");
  const [cityInput, setCityInput] = useState(city);

  // Сортування вкладки «Товари» по «Потрібно» (default desc).
  const products = useMemo(
    () => [...data.products].sort((a, b) => b.needed - a.needed),
    [data.products],
  );

  function pushParams(mutate: (sp: URLSearchParams) => void): void {
    const sp = new URLSearchParams(searchParams.toString());
    mutate(sp);
    router.push(`/manager/needs?${sp.toString()}`);
  }

  function toggleDeficit(): void {
    pushParams((sp) => {
      if (deficitOnly) sp.set("deficitOnly", "false");
      else sp.delete("deficitOnly");
    });
  }

  function applyCity(): void {
    pushParams((sp) => {
      const v = cityInput.trim();
      if (v) sp.set("city", v);
      else sp.delete("city");
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-white p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deficitOnly}
            onChange={toggleDeficit}
            className="h-4 w-4"
          />
          Тільки дефіцит
        </label>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={cityInput}
            placeholder="Місто"
            onChange={(e) => setCityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyCity();
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={applyCity}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Фільтр
          </button>
        </div>
        <button
          type="button"
          onClick={() => downloadProductsCsv(data)}
          disabled={data.products.length === 0}
          className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          📥 Експорт CSV
        </button>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-gray-200"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "border-b-2 border-blue-600 px-3 py-2 text-sm font-medium text-blue-700"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "products" && <ProductsTab products={products} />}
      {tab === "orders" && <OrdersTab orders={data.orders} />}
      {tab === "agents" && <AgentsTab rows={data.byAgent} />}
    </div>
  );
}

function ProductsTab({ products }: { products: NeedsResult["products"] }) {
  if (products.length === 0) {
    return <Empty>Потреб не знайдено.</Empty>;
  }
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Артикул</th>
            <th className="px-3 py-2">Номенклатура</th>
            <th className="px-3 py-2">Од.</th>
            <th className="px-3 py-2 text-right">Замовлено</th>
            <th className="px-3 py-2 text-right">Остаток</th>
            <th className="px-3 py-2 text-right">Потрібно</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {products.map((p) => (
            <tr
              key={p.productId}
              className={p.needed > 0 ? "bg-red-50" : "bg-green-50/40"}
            >
              <td className="px-3 py-2 text-gray-500">{p.articleCode}</td>
              <td className="px-3 py-2">{p.name}</td>
              <td className="px-3 py-2 text-gray-500">{p.unit}</td>
              <td className="px-3 py-2 text-right">{fmt(p.ordered)}</td>
              <td className="px-3 py-2 text-right">{fmt(p.available)}</td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  p.needed > 0 ? "text-red-700" : "text-green-700"
                }`}
              >
                {fmt(p.needed)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTab({ orders }: { orders: NeedsResult["orders"] }) {
  if (orders.length === 0) {
    return <Empty>Актуальних замовлень немає.</Empty>;
  }
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Номер</th>
            <th className="px-3 py-2">Клієнт</th>
            <th className="px-3 py-2">Місто</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2">Агент</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((o) => (
            <tr key={o.orderId} className="hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link
                  href={`/manager/orders/${o.orderId}`}
                  className="text-blue-700 hover:underline"
                >
                  {o.orderNumber}
                </Link>
              </td>
              <td className="px-3 py-2">{o.customerName}</td>
              <td className="px-3 py-2 text-gray-500">{o.city ?? "—"}</td>
              <td className="px-3 py-2 text-gray-500">{o.status}</td>
              <td className="px-3 py-2 text-gray-500">{o.agentName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentsTab({ rows }: { rows: NeedsResult["byAgent"] }) {
  if (rows.length === 0) {
    return <Empty>Немає даних по агентах.</Empty>;
  }
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Агент</th>
            <th className="px-3 py-2">Номенклатура</th>
            <th className="px-3 py-2">Од.</th>
            <th className="px-3 py-2 text-right">Замовлено</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr
              key={`${r.agentKey}-${r.productId}`}
              className="hover:bg-gray-50"
            >
              <td className="px-3 py-2">{r.agentName}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-gray-500">{r.unit}</td>
              <td className="px-3 py-2 text-right">{fmt(r.ordered)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
      {children}
    </div>
  );
}
