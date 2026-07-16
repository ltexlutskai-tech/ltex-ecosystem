"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@ltex/ui";
import { Users } from "lucide-react";

export interface AssortmentRow {
  productId: string;
  articleCode: string | null;
  productName: string | null;
  times: number;
  bags: number;
  avgPerKg: number;
  lastAtIso: string;
}

/**
 * Таблиця асортименту клієнта (товари з реальних продажів) + пошук усередині
 * вкладки + лінк «усі клієнти цього товару» (веде у список з фільтром
 * `assortmentSearch`).
 */
export function ClientAssortmentTable({ rows }: { rows: AssortmentRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.productName ?? "").toLowerCase().includes(q) ||
        (r.articleCode ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-800">
          Асортимент ({filtered.length})
        </h3>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук товару…"
          className="h-8 w-56"
        />
      </div>
      <p className="text-sm text-gray-500">
        Товари, які купував клієнт (за історією реалізацій).
      </p>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2">Артикул</th>
              <th className="px-4 py-2">Назва товару</th>
              <th className="px-4 py-2 text-center">Разів</th>
              <th className="px-4 py-2 text-right">Мішків</th>
              <th className="px-4 py-2 text-right">Сер. ціна, €/кг</th>
              <th className="px-4 py-2">Остання покупка</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((r) => {
              const term = r.articleCode ?? r.productName ?? "";
              return (
                <tr key={r.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {r.articleCode ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {r.productName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-700">
                    {r.times}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-gray-700">
                    {r.bags}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-gray-700">
                    {r.avgPerKg.toLocaleString("uk-UA", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-gray-500">
                    {new Date(r.lastAtIso).toLocaleDateString("uk-UA")}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">
                    {term && (
                      <Link
                        href={`/manager/customers?assortmentSearch=${encodeURIComponent(term)}`}
                        title="Показати всіх клієнтів, що беруть цей товар"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Users className="h-3.5 w-3.5" /> клієнти
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
