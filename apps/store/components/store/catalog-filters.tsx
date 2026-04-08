"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import { SEASONS, SEASON_LABELS } from "@ltex/shared";
import { COUNTRIES, COUNTRY_LABELS } from "@ltex/shared";
import { SearchAutocomplete } from "./search-autocomplete";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export function CatalogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [priceMinValue, setPriceMinValue] = useState(
    searchParams.get("priceMin") ?? "",
  );
  const [priceMaxValue, setPriceMaxValue] = useState(
    searchParams.get("priceMax") ?? "",
  );

  // Sync price inputs with URL on navigation
  useEffect(() => {
    setPriceMinValue(searchParams.get("priceMin") ?? "");
    setPriceMaxValue(searchParams.get("priceMax") ?? "");
  }, [searchParams]);

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

  const updatePriceRange = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (priceMinValue) {
      params.set("priceMin", priceMinValue);
    } else {
      params.delete("priceMin");
    }
    if (priceMaxValue) {
      params.set("priceMax", priceMaxValue);
    } else {
      params.delete("priceMax");
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams, priceMinValue, priceMaxValue]);

  const clearAll = useCallback(() => {
    setPriceMinValue("");
    setPriceMaxValue("");
    router.push(pathname);
  }, [router, pathname]);

  const hasFilters =
    searchParams.get("q") ||
    searchParams.get("quality") ||
    searchParams.get("season") ||
    searchParams.get("country") ||
    searchParams.get("sort") ||
    searchParams.get("priceMin") ||
    searchParams.get("priceMax");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-60">
          <SearchAutocomplete
            defaultValue={searchParams.get("q") ?? ""}
            placeholder={dict.catalog.search}
          />
        </div>

        <select
          value={searchParams.get("quality") ?? ""}
          onChange={(e) => updateFilter("quality", e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">{dict.catalog.allQualities}</option>
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
          <option value="">{dict.catalog.allSeasons}</option>
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
          <option value="">{dict.catalog.allCountries}</option>
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
          <option value="">{dict.catalog.sortDefault}</option>
          <option value="price_asc">{dict.catalog.sortPriceAsc}</option>
          <option value="price_desc">{dict.catalog.sortPriceDesc}</option>
          <option value="name_asc">{dict.catalog.sortNameAsc}</option>
          <option value="newest">{dict.catalog.sortNewest}</option>
        </select>
      </div>

      {/* Price range */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">{dict.catalog.priceLabel}</span>
        <input
          type="number"
          value={priceMinValue}
          onChange={(e) => setPriceMinValue(e.target.value)}
          placeholder={dict.catalog.priceFrom}
          min="0"
          step="0.5"
          className="w-24 rounded-md border px-2 py-1.5 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") updatePriceRange();
          }}
        />
        <span className="text-gray-400">—</span>
        <input
          type="number"
          value={priceMaxValue}
          onChange={(e) => setPriceMaxValue(e.target.value)}
          placeholder={dict.catalog.priceTo}
          min="0"
          step="0.5"
          className="w-24 rounded-md border px-2 py-1.5 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") updatePriceRange();
          }}
        />
        <button
          onClick={updatePriceRange}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
        >
          OK
        </button>
      </div>

      {hasFilters && (
        <button
          onClick={clearAll}
          className="text-sm text-red-600 underline hover:text-red-800"
        >
          {dict.catalog.clearAllFilters}
        </button>
      )}
    </div>
  );
}
