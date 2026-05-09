"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import { SEASONS, SEASON_LABELS } from "@ltex/shared";
import { COUNTRIES, COUNTRY_LABELS } from "@ltex/shared";
import { GENDER_OPTIONS } from "@ltex/shared";
import { SearchAutocomplete } from "./search-autocomplete";
import { RangeWithInputs } from "./range-with-inputs";
import { getDictionary } from "@/lib/i18n";
import {
  DEFAULT_PRICE_RANGE,
  DEFAULT_UNITS_RANGE,
  DEFAULT_WEIGHT_RANGE,
} from "@/lib/filter-constants";
import { useUrlSyncedRange } from "@/lib/use-url-synced-range";

const dict = getDictionary();

export interface SubcategoryOption {
  slug: string;
  name: string;
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CatalogFilters({
  subcategories,
}: {
  subcategories?: SubcategoryOption[];
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedQualities = useMemo(
    () => parseList(searchParams.get("quality")),
    [searchParams],
  );
  const selectedCountries = useMemo(
    () => parseList(searchParams.get("country")),
    [searchParams],
  );
  const selectedGenders = useMemo(
    () => parseList(searchParams.get("gender")),
    [searchParams],
  );

  const [priceBounds, setPriceBounds] =
    useState<[number, number]>(DEFAULT_PRICE_RANGE);

  const {
    value: unitsValue,
    setValue: setUnitsValue,
    commit: commitUnitsRange,
  } = useUrlSyncedRange({
    paramMin: "unitsPerKgMin",
    paramMax: "unitsPerKgMax",
    bounds: DEFAULT_UNITS_RANGE,
    resetParams: ["page"],
  });
  const {
    value: weightValue,
    setValue: setWeightValue,
    commit: commitWeightRange,
  } = useUrlSyncedRange({
    paramMin: "unitWeightMin",
    paramMax: "unitWeightMax",
    bounds: DEFAULT_WEIGHT_RANGE,
    resetParams: ["page"],
  });
  const {
    value: priceValue,
    setValue: setPriceValue,
    commit: commitPriceRange,
  } = useUrlSyncedRange({
    paramMin: "priceMin",
    paramMax: "priceMax",
    bounds: priceBounds,
    resetParams: ["page"],
  });

  // Fetch real min/max once on mount. The endpoint is cached for 5min so we
  // don't need to re-fetch on every navigation. The hook's URL→state sync
  // re-initializes the slider when `priceBounds` updates.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog/price-range")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPriceBounds([data.min, data.max]);
      })
      .catch(() => {
        // Network error → keep defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const toggleListValue = useCallback(
    (key: "quality" | "country" | "gender", value: string) => {
      const current = parseList(searchParams.get(key));
      const next = current.includes(value)
        ? current.filter((x) => x !== value)
        : [...current, value];
      updateFilter(key, next.join(","));
    },
    [searchParams, updateFilter],
  );

  const clearAll = useCallback(() => {
    setPriceValue(priceBounds);
    setUnitsValue(DEFAULT_UNITS_RANGE);
    setWeightValue(DEFAULT_WEIGHT_RANGE);
    router.push(pathname);
  }, [
    router,
    pathname,
    priceBounds,
    setPriceValue,
    setUnitsValue,
    setWeightValue,
  ]);

  const hasFilters =
    searchParams.get("q") ||
    searchParams.get("quality") ||
    searchParams.get("season") ||
    searchParams.get("country") ||
    searchParams.get("gender") ||
    searchParams.get("unitsPerKgMin") ||
    searchParams.get("unitsPerKgMax") ||
    searchParams.get("unitWeightMin") ||
    searchParams.get("unitWeightMax") ||
    searchParams.get("sort") ||
    searchParams.get("priceMin") ||
    searchParams.get("priceMax") ||
    searchParams.get("sub") ||
    searchParams.get("inStock");

  const labelClass = "mb-1 block text-sm font-medium text-gray-700";
  const selectClass = "w-full rounded-md border px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="catalog-search" className={labelClass}>
          {dict.catalog.search}
        </label>
        <SearchAutocomplete
          defaultValue={searchParams.get("q") ?? ""}
          placeholder={dict.catalog.search}
        />
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.qualityLabel}</span>
        <div className="space-y-1.5">
          {QUALITY_LEVELS.map((q) => {
            const checked = selectedQualities.includes(q);
            return (
              <label
                key={q}
                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleListValue("quality", q)}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
                />
                <span>{QUALITY_LABELS[q]}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="filter-season" className={labelClass}>
          {dict.catalog.seasonLabel}
        </label>
        <select
          id="filter-season"
          value={searchParams.get("season") ?? ""}
          onChange={(e) => updateFilter("season", e.target.value)}
          className={selectClass}
        >
          <option value="">{dict.catalog.allSeasons}</option>
          {SEASONS.filter((s) => s !== "").map((s) => (
            <option key={s} value={s}>
              {SEASON_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.countryLabel}</span>
        <div className="space-y-1.5">
          {COUNTRIES.map((c) => {
            const checked = selectedCountries.includes(c);
            return (
              <label
                key={c}
                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleListValue("country", c)}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
                />
                <span>{COUNTRY_LABELS[c]}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.genderLabel}</span>
        <div className="space-y-1.5">
          {GENDER_OPTIONS.map((g) => {
            const checked = selectedGenders.includes(g);
            return (
              <label
                key={g}
                className="flex cursor-pointer items-center gap-2 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleListValue("gender", g)}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
                />
                <span>{g}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.unitsPerKgLabel}</span>
        <RangeWithInputs
          min={DEFAULT_UNITS_RANGE[0]}
          max={DEFAULT_UNITS_RANGE[1]}
          value={unitsValue}
          onChange={setUnitsValue}
          onCommit={commitUnitsRange}
          step={1}
          unit="шт"
          ariaLabelMin={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeFrom}`}
          ariaLabelMax={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeTo}`}
        />
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.unitWeightLabel}</span>
        <RangeWithInputs
          min={DEFAULT_WEIGHT_RANGE[0]}
          max={DEFAULT_WEIGHT_RANGE[1]}
          value={weightValue}
          onChange={setWeightValue}
          onCommit={commitWeightRange}
          step={1}
          unit="кг"
          ariaLabelMin={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeFrom}`}
          ariaLabelMax={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeTo}`}
        />
      </div>

      <div>
        <label htmlFor="filter-sort" className={labelClass}>
          {dict.catalog.sortLabel}
        </label>
        <select
          id="filter-sort"
          value={searchParams.get("sort") ?? ""}
          onChange={(e) => updateFilter("sort", e.target.value)}
          className={selectClass}
        >
          <option value="">{dict.catalog.sortDefault}</option>
          <option value="price_asc">{dict.catalog.sortPriceAsc}</option>
          <option value="price_desc">{dict.catalog.sortPriceDesc}</option>
          <option value="name_asc">{dict.catalog.sortNameAsc}</option>
          <option value="newest">{dict.catalog.sortNewest}</option>
        </select>
      </div>

      {subcategories && subcategories.length > 0 && (
        <div>
          <label htmlFor="filter-sub" className={labelClass}>
            {dict.catalog.subcategory}
          </label>
          <select
            id="filter-sub"
            aria-label={dict.catalog.subcategory}
            value={searchParams.get("sub") ?? ""}
            onChange={(e) => updateFilter("sub", e.target.value)}
            className={selectClass}
          >
            <option value="">{dict.catalog.subcategoryAll}</option>
            {subcategories.map((sub) => (
              <option key={sub.slug} value={sub.slug}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className={labelClass}>{dict.catalog.priceRange}</span>
        <RangeWithInputs
          min={priceBounds[0]}
          max={priceBounds[1]}
          value={priceValue}
          onChange={setPriceValue}
          onCommit={commitPriceRange}
          step={1}
          unit="€"
          ariaLabelMin="Мінімальна ціна"
          ariaLabelMax="Максимальна ціна"
        />
      </div>

      <label className="flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={searchParams.get("inStock") === "true"}
          onChange={(e) =>
            updateFilter("inStock", e.target.checked ? "true" : "")
          }
          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
        />
        {dict.catalog.inStockOnly}
      </label>

      {hasFilters && (
        <button
          onClick={clearAll}
          className="w-full rounded-md border border-red-200 px-3 py-2 text-center text-sm text-red-600 hover:bg-red-50 hover:text-red-800"
        >
          {dict.catalog.clearAllFilters}
        </button>
      )}
    </div>
  );
}
