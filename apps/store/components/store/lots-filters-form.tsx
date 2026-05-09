"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  QUALITY_LEVELS,
  QUALITY_LABELS,
  COUNTRIES,
  COUNTRY_LABELS,
  SEASONS,
  SEASON_LABELS,
  GENDER_OPTIONS,
} from "@ltex/shared";
import { RangeWithInputs } from "./range-with-inputs";
import {
  DEFAULT_UNITS_RANGE,
  DEFAULT_WEIGHT_RANGE,
} from "@/lib/filter-constants";
import { useUrlSyncedRange } from "@/lib/use-url-synced-range";

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

  const {
    value: unitsValue,
    setValue: setUnitsValue,
    commit: commitUnitsRange,
  } = useUrlSyncedRange({
    paramMin: "unitsPerKgMin",
    paramMax: "unitsPerKgMax",
    bounds: DEFAULT_UNITS_RANGE,
    resetParams: ["page"],
    onApply,
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
    onApply,
  });

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

  const clearAll = useCallback(() => {
    setWeightMin("");
    setWeightMax("");
    setPriceMin("");
    setPriceMax("");
    setUnitsValue(DEFAULT_UNITS_RANGE);
    setWeightValue(DEFAULT_WEIGHT_RANGE);
    router.push(pathname);
    onApply?.();
  }, [router, pathname, onApply, setUnitsValue, setWeightValue]);

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

      <div>
        <span className={labelClass}>К-сть одиниць (шт/кг)</span>
        <RangeWithInputs
          min={DEFAULT_UNITS_RANGE[0]}
          max={DEFAULT_UNITS_RANGE[1]}
          value={unitsValue}
          onChange={setUnitsValue}
          onCommit={commitUnitsRange}
          step={1}
          unit="шт"
          ariaLabelMin="Шт/кг від"
          ariaLabelMax="Шт/кг до"
        />
      </div>

      <div>
        <span className={labelClass}>Вага одиниці (кг)</span>
        <RangeWithInputs
          min={DEFAULT_WEIGHT_RANGE[0]}
          max={DEFAULT_WEIGHT_RANGE[1]}
          value={weightValue}
          onChange={setWeightValue}
          onCommit={commitWeightRange}
          step={1}
          unit="кг"
          ariaLabelMin="Вага одиниці від"
          ariaLabelMax="Вага одиниці до"
        />
      </div>

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
