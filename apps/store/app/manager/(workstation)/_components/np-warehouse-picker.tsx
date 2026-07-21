"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../orders/new/_components/use-debounced-search";

/**
 * Пікер «місто + відділення Нової Пошти».
 *
 * Спільний компонент: використовується у формі реалізації (де реф-и потрібні
 * для авто-створення ТТН) та в картці клієнта (для «звірки» адреси НП). Заміняє
 * вільний ввід «№ відділення НП» на структурований вибір із довідника НП —
 * за реф-ами (`cityRef`/`warehouseRef`).
 *
 * Двоступеневий: спершу пошук міста (мін. 2 символи, debounce), потім — пошук
 * відділення в обраному місті. Обидва інпути стилізовані як решта форми
 * реалізації (`h-10 …` зелений focus-ring). Помилки fetch не «валять» форму —
 * показуємо тиху підказку.
 */

interface NpCity {
  ref: string;
  name: string;
  area: string;
}

interface NpWarehouse {
  ref: string;
  number: string;
  name: string;
  typeRef: string;
  maxWeight: number;
}

export interface NpSelection {
  cityRef: string;
  cityName: string;
  warehouseRef: string;
  warehouseName: string;
}

export interface NpWarehousePickerProps {
  cityRef: string;
  cityName: string;
  warehouseRef: string;
  warehouseName: string;
  onChange: (value: NpSelection) => void;
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400";

export function NpWarehousePicker({
  cityRef,
  cityName,
  warehouseRef,
  warehouseName,
  onChange,
}: NpWarehousePickerProps) {
  // ─── Місто ────────────────────────────────────────────────────────────────
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<NpCity[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityError, setCityError] = useState(false);
  const debouncedCity = useDebouncedValue(cityQuery, 300);

  // ─── Відділення ───────────────────────────────────────────────────────────
  const [whQuery, setWhQuery] = useState("");
  const [whResults, setWhResults] = useState<NpWarehouse[]>([]);
  const [whOpen, setWhOpen] = useState(false);
  const [whError, setWhError] = useState(false);
  const debouncedWh = useDebouncedValue(whQuery, 300);

  const hasCity = cityRef.trim().length > 0;
  const hasWarehouse = warehouseRef.trim().length > 0;

  // Найсвіжіший cityRef для warehouse-fetch (уникаємо stale closure у debounce).
  const cityRefForWh = useRef(cityRef);
  cityRefForWh.current = cityRef;

  // Пошук міст.
  useEffect(() => {
    const q = debouncedCity.trim();
    if (q.length < 2) {
      setCityResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(
          "/api/v1/manager/delivery/nova-poshta/cities",
          window.location.origin,
        );
        url.searchParams.set("q", q);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { cities: NpCity[] };
        if (!cancelled) {
          setCityResults(data.cities);
          setCityError(false);
        }
      } catch {
        if (!cancelled) {
          setCityResults([]);
          setCityError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedCity]);

  // Пошук відділень (лише коли обрано місто).
  useEffect(() => {
    if (!hasCity) {
      setWhResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(
          "/api/v1/manager/delivery/nova-poshta/warehouses",
          window.location.origin,
        );
        url.searchParams.set("cityRef", cityRefForWh.current);
        const q = debouncedWh.trim();
        if (q) url.searchParams.set("q", q);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { warehouses: NpWarehouse[] };
        if (!cancelled) {
          setWhResults(data.warehouses);
          setWhError(false);
        }
      } catch {
        if (!cancelled) {
          setWhResults([]);
          setWhError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedWh, hasCity, cityRef]);

  function pickCity(city: NpCity): void {
    // Нове місто → скидаємо раніше обране відділення.
    onChange({
      cityRef: city.ref,
      cityName: city.area ? `${city.name} (${city.area})` : city.name,
      warehouseRef: "",
      warehouseName: "",
    });
    setCityQuery("");
    setCityResults([]);
    setCityOpen(false);
    setWhQuery("");
    setWhResults([]);
  }

  function pickWarehouse(wh: NpWarehouse): void {
    onChange({
      cityRef,
      cityName,
      warehouseRef: wh.ref,
      warehouseName: wh.number
        ? `Відділення №${wh.number}: ${wh.name}`
        : wh.name,
    });
    setWhQuery("");
    setWhResults([]);
    setWhOpen(false);
  }

  function resetSelection(): void {
    onChange({
      cityRef: "",
      cityName: "",
      warehouseRef: "",
      warehouseName: "",
    });
    setCityQuery("");
    setCityResults([]);
    setWhQuery("");
    setWhResults([]);
  }

  // Обрано і місто, і відділення → компактний підсумок із «змінити».
  if (hasCity && hasWarehouse) {
    return (
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Нова Пошта — відділення
        </label>
        <div className="flex items-start justify-between gap-3 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-800">
            Обрано: {cityName} — {warehouseName}
          </span>
          <button
            type="button"
            onClick={resetSelection}
            className="shrink-0 font-medium text-green-700 hover:text-green-800"
          >
            змінити
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sm:col-span-2">
      <label
        htmlFor="np-city"
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        Нова Пошта — місто та відділення
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* ─── Місто ─────────────────────────────────────────────────────── */}
        <div className="relative">
          {hasCity ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
              <span className="truncate text-gray-800">{cityName}</span>
              <button
                type="button"
                onClick={resetSelection}
                className="shrink-0 font-medium text-green-700 hover:text-green-800"
              >
                змінити
              </button>
            </div>
          ) : (
            <>
              <input
                id="np-city"
                value={cityQuery}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  setCityOpen(true);
                }}
                onFocus={() => setCityOpen(true)}
                autoComplete="off"
                placeholder="Місто (від 2 символів)"
                className={INPUT_CLASS}
              />
              {cityOpen && cityResults.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
                  {cityResults.map((c) => (
                    <li key={c.ref}>
                      <button
                        type="button"
                        onClick={() => pickCity(c)}
                        className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-green-50"
                      >
                        {c.name}
                        {c.area ? (
                          <span className="text-gray-400"> ({c.area})</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {cityError && (
                <p className="mt-1 text-xs text-amber-600">
                  Не вдалося завантажити міста
                </p>
              )}
            </>
          )}
        </div>

        {/* ─── Відділення ────────────────────────────────────────────────── */}
        <div className="relative">
          <input
            id="np-warehouse"
            value={whQuery}
            onChange={(e) => {
              setWhQuery(e.target.value);
              setWhOpen(true);
            }}
            onFocus={() => setWhOpen(true)}
            disabled={!hasCity}
            autoComplete="off"
            placeholder={
              hasCity ? "Відділення (номер або назва)" : "Спершу оберіть місто"
            }
            className={INPUT_CLASS}
          />
          {whOpen && hasCity && whResults.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
              {whResults.map((w) => (
                <li key={w.ref}>
                  <button
                    type="button"
                    onClick={() => pickWarehouse(w)}
                    className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-green-50"
                  >
                    {w.number ? (
                      <span className="font-medium">
                        Відділення №{w.number}:{" "}
                      </span>
                    ) : null}
                    {w.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {whError && (
            <p className="mt-1 text-xs text-amber-600">
              Не вдалося завантажити відділення
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
