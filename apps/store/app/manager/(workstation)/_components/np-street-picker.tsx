"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "../orders/new/_components/use-debounced-search";

/**
 * Пікер адреси «до дверей» Нової Пошти: вулиця (пошук у довіднику НП) + будинок
 * + квартира. Використовується у формі реалізації, коли обрано доставку кур'єром
 * на адресу (`ServiceType=WarehouseDoors`).
 *
 * Пошук вулиць — у межах уже обраного міста (`cityRef`), тому місто лишається у
 * пікері відділення вище. Помилки fetch не «валять» форму — тиха підказка.
 */

interface NpStreet {
  ref: string;
  name: string;
}

export interface NpAddressSelection {
  streetRef: string;
  streetName: string;
  building: string;
  flat: string;
}

export interface NpStreetPickerProps {
  cityRef: string;
  streetRef: string;
  streetName: string;
  building: string;
  flat: string;
  onChange: (value: NpAddressSelection) => void;
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400";

export function NpStreetPicker({
  cityRef,
  streetRef,
  streetName,
  building,
  flat,
  onChange,
}: NpStreetPickerProps) {
  const [streetQuery, setStreetQuery] = useState("");
  const [results, setResults] = useState<NpStreet[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const debounced = useDebouncedValue(streetQuery, 300);

  const hasCity = cityRef.trim().length > 0;
  const hasStreet = streetRef.trim().length > 0;

  useEffect(() => {
    const q = debounced.trim();
    if (!hasCity || q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(
          "/api/v1/manager/np/streets",
          window.location.origin,
        );
        url.searchParams.set("cityRef", cityRef);
        url.searchParams.set("q", q);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { streets: NpStreet[] };
        if (!cancelled) {
          setResults(data.streets);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, cityRef, hasCity]);

  function pickStreet(s: NpStreet): void {
    onChange({ streetRef: s.ref, streetName: s.name, building, flat });
    setStreetQuery("");
    setResults([]);
    setOpen(false);
  }

  function resetStreet(): void {
    onChange({ streetRef: "", streetName: "", building, flat });
    setStreetQuery("");
    setResults([]);
  }

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <label
        htmlFor="np-street"
        className="mb-1 block text-sm font-medium text-gray-700"
      >
        Нова Пошта — адреса кур'єром (вулиця, будинок, квартира)
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* ─── Вулиця ──────────────────────────────────────────────────────── */}
        <div className="relative sm:col-span-2">
          {hasStreet ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
              <span className="truncate text-gray-800">{streetName}</span>
              <button
                type="button"
                onClick={resetStreet}
                className="shrink-0 font-medium text-green-700 hover:text-green-800"
              >
                змінити
              </button>
            </div>
          ) : (
            <>
              <input
                id="np-street"
                value={streetQuery}
                onChange={(e) => {
                  setStreetQuery(e.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                disabled={!hasCity}
                autoComplete="off"
                placeholder={
                  hasCity ? "Вулиця (від 2 символів)" : "Спершу оберіть місто"
                }
                className={INPUT_CLASS}
              />
              {open && hasCity && results.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
                  {results.map((s) => (
                    <li key={s.ref}>
                      <button
                        type="button"
                        onClick={() => pickStreet(s)}
                        className="block w-full px-3 py-1.5 text-left text-gray-800 hover:bg-green-50"
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p className="mt-1 text-xs text-amber-600">
                  Не вдалося завантажити вулиці
                </p>
              )}
            </>
          )}
        </div>

        {/* ─── Будинок ─────────────────────────────────────────────────────── */}
        <div>
          <input
            id="np-building"
            value={building}
            onChange={(e) =>
              onChange({
                streetRef,
                streetName,
                building: e.target.value,
                flat,
              })
            }
            maxLength={40}
            placeholder="Будинок (напр. 12А)"
            className={INPUT_CLASS}
          />
        </div>

        {/* ─── Квартира ────────────────────────────────────────────────────── */}
        <div>
          <input
            id="np-flat"
            value={flat}
            onChange={(e) =>
              onChange({
                streetRef,
                streetName,
                building,
                flat: e.target.value,
              })
            }
            maxLength={40}
            placeholder="Квартира (необов'язково)"
            className={INPUT_CLASS}
          />
        </div>
      </div>
    </div>
  );
}
