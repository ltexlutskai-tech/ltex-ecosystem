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

const dict = getDictionary();

const DEFAULT_PRICE_RANGE: [number, number] = [0, 100];
const DEFAULT_UNITS_RANGE: [number, number] = [1, 1000];
const DEFAULT_WEIGHT_RANGE: [number, number] = [1, 1000];

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

  const urlUnitsMin = searchParams.get("unitsPerKgMin");
  const urlUnitsMax = searchParams.get("unitsPerKgMax");
  const urlWeightMin = searchParams.get("unitWeightMin");
  const urlWeightMax = searchParams.get("unitWeightMax");

  const [unitsBounds, setUnitsBounds] =
    useState<[number, number]>(DEFAULT_UNITS_RANGE);
  const [weightBounds, setWeightBounds] =
    useState<[number, number]>(DEFAULT_WEIGHT_RANGE);
  const [unitsValue, setUnitsValue] = useState<[number, number]>([
    urlUnitsMin ? Number(urlUnitsMin) : DEFAULT_UNITS_RANGE[0],
    urlUnitsMax ? Number(urlUnitsMax) : DEFAULT_UNITS_RANGE[1],
  ]);
  const [weightValue, setWeightValue] = useState<[number, number]>([
    urlWeightMin ? Number(urlWeightMin) : DEFAULT_WEIGHT_RANGE[0],
    urlWeightMax ? Number(urlWeightMax) : DEFAULT_WEIGHT_RANGE[1],
  ]);
  const [rangesLoaded, setRangesLoaded] = useState(false);

  const [priceBounds, setPriceBounds] =
    useState<[number, number]>(DEFAULT_PRICE_RANGE);
  const urlPriceMin = searchParams.get("priceMin");
  const urlPriceMax = searchParams.get("priceMax");
  const [priceValue, setPriceValue] = useState<[number, number]>([
    urlPriceMin ? Number(urlPriceMin) : DEFAULT_PRICE_RANGE[0],
    urlPriceMax ? Number(urlPriceMax) : DEFAULT_PRICE_RANGE[1],
  ]);

  // Fetch real min/max once on mount. The endpoint is cached for 5min so we
  // don't need to re-fetch on every navigation.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog/price-range")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const next: [number, number] = [data.min, data.max];
        setPriceBounds(next);
        // Initialize slider to bounds when no URL value is set.
        setPriceValue((prev) => {
          const lo = urlPriceMin ? Number(urlPriceMin) : data.min;
          const hi = urlPriceMax ? Number(urlPriceMax) : data.max;
          if (prev[0] === lo && prev[1] === hi) return prev;
          return [lo, hi];
        });
      })
      .catch(() => {
        // Network error → keep defaults.
      });
    return () => {
      cancelled = true;
    };
    // Intentionally excluded url deps — bounds fetched once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync slider when URL changes externally (e.g. clear all).
  useEffect(() => {
    setPriceValue([
      urlPriceMin ? Number(urlPriceMin) : priceBounds[0],
      urlPriceMax ? Number(urlPriceMax) : priceBounds[1],
    ]);
  }, [urlPriceMin, urlPriceMax, priceBounds]);

  // Fetch unitsPerKg/unitWeight bounds once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalog/numeric-ranges")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const u: [number, number] = [data.unitsPerKg.min, data.unitsPerKg.max];
        const w: [number, number] = [data.unitWeight.min, data.unitWeight.max];
        setUnitsBounds(u);
        setWeightBounds(w);
        setRangesLoaded(true);
        setUnitsValue((prev) => {
          const lo = urlUnitsMin ? Number(urlUnitsMin) : u[0];
          const hi = urlUnitsMax ? Number(urlUnitsMax) : u[1];
          if (prev[0] === lo && prev[1] === hi) return prev;
          return [lo, hi];
        });
        setWeightValue((prev) => {
          const lo = urlWeightMin ? Number(urlWeightMin) : w[0];
          const hi = urlWeightMax ? Number(urlWeightMax) : w[1];
          if (prev[0] === lo && prev[1] === hi) return prev;
          return [lo, hi];
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync sliders when URL changes externally.
  useEffect(() => {
    setUnitsValue([
      urlUnitsMin ? Number(urlUnitsMin) : unitsBounds[0],
      urlUnitsMax ? Number(urlUnitsMax) : unitsBounds[1],
    ]);
  }, [urlUnitsMin, urlUnitsMax, unitsBounds]);
  useEffect(() => {
    setWeightValue([
      urlWeightMin ? Number(urlWeightMin) : weightBounds[0],
      urlWeightMax ? Number(urlWeightMax) : weightBounds[1],
    ]);
  }, [urlWeightMin, urlWeightMax, weightBounds]);

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

  const commitUnitsRange = useCallback(
    ([lo, hi]: [number, number]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (lo > unitsBounds[0]) params.set("unitsPerKgMin", String(lo));
      else params.delete("unitsPerKgMin");
      if (hi < unitsBounds[1]) params.set("unitsPerKgMax", String(hi));
      else params.delete("unitsPerKgMax");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, unitsBounds],
  );

  const commitWeightRange = useCallback(
    ([lo, hi]: [number, number]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (lo > weightBounds[0]) params.set("unitWeightMin", String(lo));
      else params.delete("unitWeightMin");
      if (hi < weightBounds[1]) params.set("unitWeightMax", String(hi));
      else params.delete("unitWeightMax");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, weightBounds],
  );

  const commitPriceRange = useCallback(
    ([lo, hi]: [number, number]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (lo > priceBounds[0]) {
        params.set("priceMin", String(lo));
      } else {
        params.delete("priceMin");
      }
      if (hi < priceBounds[1]) {
        params.set("priceMax", String(hi));
      } else {
        params.delete("priceMax");
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, priceBounds],
  );

  const clearAll = useCallback(() => {
    setPriceValue(priceBounds);
    setUnitsValue(unitsBounds);
    setWeightValue(weightBounds);
    router.push(pathname);
  }, [router, pathname, priceBounds, unitsBounds, weightBounds]);

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

      {rangesLoaded && unitsBounds[1] > unitsBounds[0] && (
        <div>
          <span className={labelClass}>{dict.catalog.unitsPerKgLabel}</span>
          <RangeWithInputs
            min={unitsBounds[0]}
            max={unitsBounds[1]}
            value={unitsValue}
            onChange={setUnitsValue}
            onCommit={commitUnitsRange}
            step={1}
            unit="шт"
            ariaLabelMin={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeFrom}`}
            ariaLabelMax={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeTo}`}
          />
        </div>
      )}

      {rangesLoaded && weightBounds[1] > weightBounds[0] && (
        <div>
          <span className={labelClass}>{dict.catalog.unitWeightLabel}</span>
          <RangeWithInputs
            min={weightBounds[0]}
            max={weightBounds[1]}
            value={weightValue}
            onChange={setWeightValue}
            onCommit={commitWeightRange}
            step={1}
            unit="кг"
            ariaLabelMin={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeFrom}`}
            ariaLabelMax={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeTo}`}
          />
        </div>
      )}

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
