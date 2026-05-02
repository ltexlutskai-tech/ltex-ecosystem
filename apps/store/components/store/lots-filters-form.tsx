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
} from "@ltex/shared";

export interface LotCategoryOption {
  id: string;
  name: string;
  count: number;
}

interface LotsFiltersFormProps {
  categories: LotCategoryOption[];
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

export function LotsFiltersForm({ categories, onApply }: LotsFiltersFormProps) {
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

  const urlWeightMin = searchParams.get("weightMin") ?? "";
  const urlWeightMax = searchParams.get("weightMax") ?? "";
  const urlPriceMin = searchParams.get("priceMin") ?? "";
  const urlPriceMax = searchParams.get("priceMax") ?? "";

  const [weightMin, setWeightMin] = useState(urlWeightMin);
  const [weightMax, setWeightMax] = useState(urlWeightMax);
  const [priceMin, setPriceMin] = useState(urlPriceMin);
  const [priceMax, setPriceMax] = useState(urlPriceMax);

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
    if (weightMin) params.set("weightMin", weightMin);
    else params.delete("weightMin");
    if (weightMax) params.set("weightMax", weightMax);
    else params.delete("weightMax");
    if (priceMin) params.set("priceMin", priceMin);
    else params.delete("priceMin");
    if (priceMax) params.set("priceMax", priceMax);
    else params.delete("priceMax");
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
    router.push(pathname);
    onApply?.();
  }, [router, pathname, onApply]);

  const hasActiveFilters =
    selectedStatuses.length > 0 ||
    isNewOnly ||
    selectedCategories.length > 0 ||
    selectedQualities.length > 0 ||
    selectedSeasons.length > 0 ||
    selectedCountries.length > 0 ||
    urlWeightMin ||
    urlWeightMax ||
    urlPriceMin ||
    urlPriceMax;

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

      {categories.length > 0 && (
        <div>
          <span className={labelClass}>Категорія</span>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 text-sm">
            {categories.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(c.id)}
                  onChange={() => toggleListValue("categoryId", c.id)}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-1 focus:ring-green-500"
                />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-gray-400">({c.count})</span>
              </label>
            ))}
          </div>
        </div>
      )}

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
        <span className={labelClass}>Ціна, €</span>
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
          Застосувати ціну та вагу
        </button>
      </div>
    </div>
  );
}
