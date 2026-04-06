"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import { SEASONS, SEASON_LABELS } from "@ltex/shared";
import { COUNTRIES, COUNTRY_LABELS } from "@ltex/shared";

export function CatalogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap gap-3">
      <input
        defaultValue={searchParams.get("q") ?? ""}
        placeholder="Пошук товарів..."
        className="w-full rounded-md border px-3 py-2 text-sm sm:w-60"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            updateFilter("q", (e.target as HTMLInputElement).value);
          }
        }}
      />

      <select
        value={searchParams.get("quality") ?? ""}
        onChange={(e) => updateFilter("quality", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">Всі якості</option>
        {QUALITY_LEVELS.map((q) => (
          <option key={q} value={q}>
            {QUALITY_LABELS[q]}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("season") ?? ""}
        onChange={(e) => updateFilter("season", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">Всі сезони</option>
        {SEASONS.filter((s) => s !== "").map((s) => (
          <option key={s} value={s}>
            {SEASON_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("country") ?? ""}
        onChange={(e) => updateFilter("country", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">Всі країни</option>
        {COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {COUNTRY_LABELS[c]}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("sort") ?? ""}
        onChange={(e) => updateFilter("sort", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">За замовчуванням</option>
        <option value="price_asc">Ціна: від дешевих</option>
        <option value="price_desc">Ціна: від дорогих</option>
        <option value="name_asc">Назва: А–Я</option>
        <option value="newest">Найновіші</option>
      </select>
    </div>
  );
}
