"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUALITY_LEVELS, QUALITY_LABELS } from "@ltex/shared";
import { SEASONS, SEASON_LABELS } from "@ltex/shared";
import { COUNTRIES, COUNTRY_LABELS } from "@ltex/shared";
import { GENDER_OPTIONS } from "@ltex/shared";
import { SearchAutocomplete } from "./search-autocomplete";
import { PriceRangeSlider } from "./price-range-slider";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

const DEFAULT_PRICE_RANGE: [number, number] = [0, 100];

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

  const urlSizes = searchParams.get("sizes") ?? "";
  const [sizesDraft, setSizesDraft] = useState(urlSizes);
  // Keep input in sync when URL changes externally (clear-all, browser nav).
  useEffect(() => {
    setSizesDraft(urlSizes);
  }, [urlSizes]);
  const sizesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const urlUnitsMin = searchParams.get("unitsPerKgMin") ?? "";
  const urlUnitsMax = searchParams.get("unitsPerKgMax") ?? "";
  const urlWeightMin = searchParams.get("unitWeightMin") ?? "";
  const urlWeightMax = searchParams.get("unitWeightMax") ?? "";
  const [unitsMinDraft, setUnitsMinDraft] = useState(urlUnitsMin);
  const [unitsMaxDraft, setUnitsMaxDraft] = useState(urlUnitsMax);
  const [weightMinDraft, setWeightMinDraft] = useState(urlWeightMin);
  const [weightMaxDraft, setWeightMaxDraft] = useState(urlWeightMax);
  useEffect(() => setUnitsMinDraft(urlUnitsMin), [urlUnitsMin]);
  useEffect(() => setUnitsMaxDraft(urlUnitsMax), [urlUnitsMax]);
  useEffect(() => setWeightMinDraft(urlWeightMin), [urlWeightMin]);
  useEffect(() => setWeightMaxDraft(urlWeightMax), [urlWeightMax]);

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

  const debouncedUpdateSizes = useCallback(
    (value: string) => {
      setSizesDraft(value);
      if (sizesDebounceRef.current) clearTimeout(sizesDebounceRef.current);
      sizesDebounceRef.current = setTimeout(() => {
        updateFilter("sizes", value.trim());
      }, 350);
    },
    [updateFilter],
  );

  // Apply both range inputs (units/kg, weight/unit) at once. Pattern matches
  // the lots-filters-form Apply button — better UX than commit-on-blur.
  const applyNumericRanges = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) params.set(key, trimmed);
      else params.delete(key);
    };
    setOrDelete("unitsPerKgMin", unitsMinDraft);
    setOrDelete("unitsPerKgMax", unitsMaxDraft);
    setOrDelete("unitWeightMin", weightMinDraft);
    setOrDelete("unitWeightMax", weightMaxDraft);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }, [
    router,
    pathname,
    searchParams,
    unitsMinDraft,
    unitsMaxDraft,
    weightMinDraft,
    weightMaxDraft,
  ]);

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
    router.push(pathname);
  }, [router, pathname, priceBounds]);

  const hasFilters =
    searchParams.get("q") ||
    searchParams.get("quality") ||
    searchParams.get("season") ||
    searchParams.get("country") ||
    searchParams.get("gender") ||
    searchParams.get("sizes") ||
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
        <label htmlFor="filter-sizes" className={labelClass}>
          {dict.catalog.sizesLabel}
        </label>
        <input
          id="filter-sizes"
          type="text"
          inputMode="text"
          placeholder={dict.catalog.sizesPlaceholder}
          value={sizesDraft}
          onChange={(e) => debouncedUpdateSizes(e.target.value)}
          className={selectClass}
        />
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.unitsPerKgLabel}</span>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            placeholder={dict.catalog.rangeFrom}
            value={unitsMinDraft}
            onChange={(e) => setUnitsMinDraft(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeFrom}`}
          />
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            placeholder={dict.catalog.rangeTo}
            value={unitsMaxDraft}
            onChange={(e) => setUnitsMaxDraft(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label={`${dict.catalog.unitsPerKgLabel} ${dict.catalog.rangeTo}`}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>{dict.catalog.unitWeightLabel}</span>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.05}
            placeholder={dict.catalog.rangeFrom}
            value={weightMinDraft}
            onChange={(e) => setWeightMinDraft(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeFrom}`}
          />
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.05}
            placeholder={dict.catalog.rangeTo}
            value={weightMaxDraft}
            onChange={(e) => setWeightMaxDraft(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label={`${dict.catalog.unitWeightLabel} ${dict.catalog.rangeTo}`}
          />
        </div>
        <button
          type="button"
          onClick={applyNumericRanges}
          className="mt-3 w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          {dict.catalog.rangeApply}
        </button>
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
        <PriceRangeSlider
          min={priceBounds[0]}
          max={priceBounds[1]}
          value={priceValue}
          onChange={setPriceValue}
          onCommit={commitPriceRange}
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
