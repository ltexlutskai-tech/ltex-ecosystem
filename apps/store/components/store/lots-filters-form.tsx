"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  QUALITY_LEVELS,
  QUALITY_LABELS,
  COUNTRIES,
  COUNTRY_LABELS,
  SEASONS,
  SEASON_LABELS,
  GENDER_OPTIONS,
} from "@ltex/shared";
import { PriceRangeSlider } from "./price-range-slider";

const DEFAULT_UNITS_RANGE: [number, number] = [1, 1000];
const DEFAULT_WEIGHT_RANGE: [number, number] = [1, 1000];

export interface LotCategoryOption {
  id: string;
  name: string;
  count: number;
}

interface LotsFiltersFormProps {
  /** Optional callback fired after filter change — used by mobile sheet to close. */
  onApply?: () => void;
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const labelClass = "mb-2 block text-sm font-medium text-gray-700";

export function LotsFiltersForm({ onApply }: LotsFiltersFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedStatuses = useMemo(
    () => parseList(searchParams.get("status")),
    [searchParams],
  );
  const isNewOnly = searchParams.get("isNew") === "true";
  const selectedCategories = useMemo(
    () => parseList(searchParams.get("categoryId")),
    [searchParams],
  );
  const selectedQualities = useMemo(
    () => parseList(searchParams.get("quality")),
    [searchParams],
  );
  const selectedSeasons = useMemo(
    () => parseList(searchParams.get("season")),
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

  const urlWeightMin = searchParams.get("weightMin") ?? "";
  const urlWeightMax = searchParams.get("weightMax") ?? "";
  const urlPriceMin = searchParams.get("priceMin") ?? "";
  const urlPriceMax = searchParams.get("priceMax") ?? "";
  const urlUnitsMin = searchParams.get("unitsPerKgMin");
  const urlUnitsMax = searchParams.get("unitsPerKgMax");
  const urlUnitWeightMin = searchParams.get("unitWeightMin");
  const urlUnitWeightMax = searchParams.get("unitWeightMax");

  const [weightMin, setWeightMin] = useState(urlWeightMin);
  const [weightMax, setWeightMax] = useState(urlWeightMax);
  const [priceMin, setPriceMin] = useState(urlPriceMin);
  const [priceMax, setPriceMax] = useState(urlPriceMax);

  const [unitsBounds, setUnitsBounds] =
    useState<[number, number]>(DEFAULT_UNITS_RANGE);
  const [weightBounds, setWeightBounds] =
    useState<[number, number]>(DEFAULT_WEIGHT_RANGE);
  const [unitsValue, setUnitsValue] = useState<[number, number]>([
    urlUnitsMin ? Number(urlUnitsMin) : DEFAULT_UNITS_RANGE[0],
    urlUnitsMax ? Number(urlUnitsMax) : DEFAULT_UNITS_RANGE[1],
  ]);
  const [weightValue, setWeightValue] = useState<[number, number]>([
    urlUnitWeightMin ? Number(urlUnitWeightMin) : DEFAULT_WEIGHT_RANGE[0],
    urlUnitWeightMax ? Number(urlUnitWeightMax) : DEFAULT_WEIGHT_RANGE[1],
  ]);
  const [rangesLoaded, setRangesLoaded] = useState(false);

  // Fetch numeric bounds once on mount.
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
          const lo = urlUnitWeightMin ? Number(urlUnitWeightMin) : w[0];
          const hi = urlUnitWeightMax ? Number(urlUnitWeightMax) : w[1];
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
      urlUnitWeightMin ? Number(urlUnitWeightMin) : weightBounds[0],
      urlUnitWeightMax ? Number(urlUnitWeightMax) : weightBounds[1],
    ]);
  }, [urlUnitWeightMin, urlUnitWeightMax, weightBounds]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
      onApply?.();
    },
    [router, pathname, searchParams, onApply],
  );

  const toggleListValue = useCallback(
    (key: string, value: string) => {
      const current = parseList(searchParams.get(key));
      const next = current.includes(value)
        ? current.filter((x) => x !== value)
        : [...current, value];
      updateParam(key, next.join(","));
    },
    [searchParams, updateParam],
  );

  const commitRanges = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete("weightMin", weightMin);
    setOrDelete("weightMax", weightMax);
    setOrDelete("priceMin", priceMin);
    setOrDelete("priceMax", priceMax);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
    onApply?.();
  }, [
    router,
    pathname,
    searchParams,
    onApply,
    weightMin,
    weightMax,
    priceMin,
    priceMax,
  ]);

  const commitUnitsRange = useCallback(
    ([lo, hi]: [number, number]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (lo > unitsBounds[0]) params.set("unitsPerKgMin", String(lo));
      else params.delete("unitsPerKgMin");
      if (hi < unitsBounds[1]) params.set("unitsPerKgMax", String(hi));
      else params.delete("unitsPerKgMax");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
      onApply?.();
    },
    [router, pathname, searchParams, unitsBounds, onApply],
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
      onApply?.();
    },
    [router, pathname, searchParams, weightBounds, onApply],
  );

  const clearAll = useCallback(() => {
    setWeightMin("");
    setWeightMax("");
    setPriceMin("");
    setPriceMax("");
    setUnitsValue(unitsBounds);
    setWeightValue(weightBounds);
    router.push(pathname);
    onApply?.();
  }, [router, pathname, onApply, unitsBounds, weightBounds]);

  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    isNewOnly ||
    selectedCategories.length > 0 ||
    selectedQualities.length > 0 ||
    selectedSeasons.length > 0 ||
    selectedCountries.length > 0 ||
    selectedGenders.length > 0 ||
    urlWeightMin ||
    urlWeightMax ||
    urlPriceMin ||
    urlPriceMax ||
    urlUnitsMin ||
    urlUnitsMax ||
    urlUnitWeightMin ||
    urlUnitWeightMax;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Фільтри</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-gray-500 hover:text-red-500"
          >
            Скинути
          </button>
        )}
      </div>

      <div>
        <span className={labelClass}>Статус</span>
        <div className="space-y-1.5 text-sm">
          <label className="flex cursor-pointer items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={selectedStatuses.includes("reserved")}
              onChange={() => toggleListValue("status", "reserved")}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
            />
            Заброньовані
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={selectedStatuses.includes("free")}
              onChange={() => toggleListValue("status", "free")}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
            />
            Вільні
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={selectedStatuses.includes("on_sale")}
              onChange={() => toggleListValue("status", "on_sale")}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
            />
            Акції
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              checked={isNewOnly}
              onChange={(e) =>
                updateParam("isNew", e.target.checked ? "true" : "")
              }
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
            />
            Новинки <span className="text-xs text-gray-400">(14 днів)</span>
          </label>
        </div>
      </div>

      {/* Categories rendered as horizontal pills above the page (lots-category-pills.tsx) */}

      <div>
        <span className={labelClass}>Сорт</span>
        <div className="space-y-1.5 text-sm">
          {QUALITY_LEVELS.map((q) => (
            <label
              key={q}
              className="flex cursor-pointer items-center gap-2 text-gray-700"
            >
              <input
                type="checkbox"
                checked={selectedQualities.includes(q)}
                onChange={() => toggleListValue("quality", q)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
              />
              {QUALITY_LABELS[q]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Сезон</span>
        <div className="space-y-1.5 text-sm">
          {SEASONS.filter((s) => s !== "").map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 text-gray-700"
            >
              <input
                type="checkbox"
                checked={selectedSeasons.includes(s)}
                onChange={() => toggleListValue("season", s)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
              />
              {SEASON_LABELS[s]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Країна</span>
        <div className="space-y-1.5 text-sm">
          {COUNTRIES.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2 text-gray-700"
            >
              <input
                type="checkbox"
                checked={selectedCountries.includes(c)}
                onChange={() => toggleListValue("country", c)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
              />
              {COUNTRY_LABELS[c]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className={labelClass}>Стать</span>
        <div className="space-y-1.5 text-sm">
          {GENDER_OPTIONS.map((g) => (
            <label
              key={g}
              className="flex cursor-pointer items-center gap-2 text-gray-700"
            >
              <input
                type="checkbox"
                checked={selectedGenders.includes(g)}
                onChange={() => toggleListValue("gender", g)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      {rangesLoaded && unitsBounds[1] > unitsBounds[0] && (
        <div>
          <span className={labelClass}>К-сть одиниць (шт/кг)</span>
          <PriceRangeSlider
            min={unitsBounds[0]}
            max={unitsBounds[1]}
            value={unitsValue}
            onChange={setUnitsValue}
            onCommit={commitUnitsRange}
            step={1}
            ariaLabelMin="Шт/кг від"
            ariaLabelMax="Шт/кг до"
            formatValue={(v) => `${v} шт`}
          />
        </div>
      )}

      {rangesLoaded && weightBounds[1] > weightBounds[0] && (
        <div>
          <span className={labelClass}>Вага одиниці (кг)</span>
          <PriceRangeSlider
            min={weightBounds[0]}
            max={weightBounds[1]}
            value={weightValue}
            onChange={setWeightValue}
            onCommit={commitWeightRange}
            step={1}
            ariaLabelMin="Вага одиниці від"
            ariaLabelMax="Вага одиниці до"
            formatValue={(v) => `${v} кг`}
          />
        </div>
      )}

      <div>
        <span className={labelClass}>Вага лота, кг</span>
        <div className="flex gap-2 text-sm">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="від"
            value={weightMin}
            onChange={(e) => setWeightMin(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label="Вага лота від"
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="до"
            value={weightMax}
            onChange={(e) => setWeightMax(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label="Вага лота до"
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Ціна лота, ₴</span>
        <div className="flex gap-2 text-sm">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="від"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label="Ціна від"
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="до"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="w-full rounded border px-2 py-1.5"
            aria-label="Ціна до"
          />
        </div>
        <button
          type="button"
          onClick={commitRanges}
          className="mt-3 w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Застосувати діапазони
        </button>
      </div>
    </div>
  );
}
