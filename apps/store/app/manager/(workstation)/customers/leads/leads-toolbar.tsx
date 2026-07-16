"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@ltex/ui";

interface Props {
  /** DISTINCT непорожні міста наявних лідів (для селектора «Місто»). */
  cityOptions: string[];
  /** DISTINCT джерела наявних лідів (для селектора «Джерело»). */
  sourceOptions: string[];
}

/**
 * Компактна панель фільтрів списку лідів: пошук (debounce 350 мс, URL-параметр
 * `q`) + селектори «Місто»/«Джерело» + діапазон дат `Від`/`До`. Кожна зміна
 * скидає `page` (повернення на першу сторінку).
 */
export function LeadsToolbar({ cityOptions, sourceOptions }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  function setParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  // Динамічний пошук — оновлює URL за 350 мс після останнього символу.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    const next = search.trim();
    if (next === current) return;
    const t = setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next) sp.set("q", next);
      else sp.delete("q");
      sp.delete("page");
      startTransition(() => router.push(`${pathname}?${sp.toString()}`));
    }, 350);
    return () => clearTimeout(t);
  }, [search, searchParams, pathname, router, startTransition]);

  const city = searchParams.get("city") ?? "";
  const source = searchParams.get("source") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const selectClass =
    "rounded-md border bg-white px-2 py-1.5 text-sm text-gray-700";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Пошук за іменем, телефоном або містом…"
        className="min-w-[220px] flex-1"
      />

      <select
        value={city}
        onChange={(e) => setParam("city", e.target.value || null)}
        className={selectClass}
        aria-label="Місто"
      >
        <option value="">Усі міста</option>
        {cityOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={source}
        onChange={(e) => setParam("source", e.target.value || null)}
        className={selectClass}
        aria-label="Джерело"
      >
        <option value="">Усі джерела</option>
        {sourceOptions.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1 text-xs text-gray-500">
        Від
        <input
          type="date"
          value={from}
          onChange={(e) => setParam("from", e.target.value || null)}
          className={selectClass}
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-gray-500">
        До
        <input
          type="date"
          value={to}
          onChange={(e) => setParam("to", e.target.value || null)}
          className={selectClass}
        />
      </label>
    </div>
  );
}
