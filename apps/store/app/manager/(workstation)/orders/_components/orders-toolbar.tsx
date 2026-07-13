"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button, Input } from "@ltex/ui";
import {
  ORDER_STATUS_LIST,
  ORDER_STATUS_META,
} from "@/lib/manager/order-status";
import { ClientFilterPicker } from "./client-filter-picker";

export function OrdersToolbar({
  cityOptions = [],
  agentOptions = [],
}: {
  /** Довідник міст для фільтра (щоб уникнути опечаток, 8.1). */
  cityOptions?: string[];
  /** Довідник торгових агентів для фільтра. */
  agentOptions?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const clientName = searchParams.get("clientName") ?? "";
  const city = searchParams.get("city") ?? "";
  const agent = searchParams.get("agent") ?? "";
  const status = searchParams.get("status") ?? "";
  const actuality = searchParams.get("actuality") ?? "actual";
  const source = searchParams.get("source") ?? "";
  const clientCode1C = searchParams.get("clientCode1C") ?? "";
  const showArchived = searchParams.get("showArchived") === "true";

  // Розгорнути блок per-column фільтрів, якщо хоч один уже застосовано.
  const hasColumnFilters = !!(clientName || clientCode1C || city || agent);
  const [showFilters, setShowFilters] = useState(hasColumnFilters);

  useEffect(() => {
    // `search` НЕ синхронізуємо з URL — живий пошук (нижче) сам веде URL,
    // а зворотна синхронізація перетирала б набраний текст під час transition.
    setFrom(searchParams.get("from") ?? "");
    setTo(searchParams.get("to") ?? "");
  }, [searchParams]);

  // Живий пошук (7.3): застосовується при наборі, без Enter (debounce 350мс).
  useEffect(() => {
    const urlValue = searchParams.get("search") ?? "";
    if (search.trim() === urlValue) return;
    const handle = window.setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      if (search.trim()) sp.set("search", search.trim());
      else sp.delete("search");
      sp.delete("page");
      startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, searchParams]);

  function setParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  /** Множинне оновлення URL-параметрів за один перехід. */
  function setParams(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(patch)) {
      if (value === null || value === "") sp.delete(name);
      else sp.set(name, value);
    }
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function applyDates() {
    setParams({ from: from || null, to: to || null });
  }

  function clearAll() {
    setSearch("");
    setFrom("");
    setTo("");
    startTransition(() => router.push(pathname));
  }

  const clientLabel = clientName || clientCode1C || null;

  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (search.trim()) setParam("search", search.trim());
            else setParam("search", null);
          }}
          className="flex min-w-[260px] flex-1 items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за №, клієнтом або товаром (артикул/назва)…"
              className="pl-8"
            />
          </div>
        </form>

        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value || null)}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Фільтр за статусом"
        >
          <option value="">Усі статуси</option>
          {ORDER_STATUS_LIST.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_META[s].label}
            </option>
          ))}
        </select>

        <select
          value={actuality}
          onChange={(e) =>
            setParam(
              "actuality",
              e.target.value === "actual" ? null : e.target.value,
            )
          }
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Фільтр за актуальністю"
        >
          <option value="actual">Актуальні</option>
          <option value="inactive">Неактуальні</option>
          <option value="all">Усі</option>
        </select>

        <select
          value={source}
          onChange={(e) => setParam("source", e.target.value || null)}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Фільтр за джерелом"
        >
          <option value="">Усі джерела</option>
          <option value="site">Сайт</option>
          <option value="manual">Ручні</option>
        </select>

        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500" htmlFor="from-date">
            З
          </label>
          <Input
            id="from-date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={applyDates}
            className="h-9 w-[140px]"
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500" htmlFor="to-date">
            До
          </label>
          <Input
            id="to-date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onBlur={applyDates}
            className="h-9 w-[140px]"
          />
        </div>

        <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) =>
              setParam("showArchived", e.target.checked ? "true" : null)
            }
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Показати архів (проведені)
        </label>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFilters((v) => !v)}
          className={hasColumnFilters ? "border-green-500 text-green-700" : ""}
        >
          <SlidersHorizontal className="mr-1 h-4 w-4" />
          Фільтри
          {hasColumnFilters
            ? ` (${[clientLabel, city, agent].filter(Boolean).length})`
            : ""}
        </Button>

        {(search ||
          status ||
          actuality !== "actual" ||
          source ||
          from ||
          to ||
          clientCode1C ||
          clientName ||
          city ||
          agent ||
          showArchived) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-gray-600"
          >
            <X className="mr-1 h-4 w-4" />
            Очистити
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Клієнт</label>
            <ClientFilterPicker
              currentLabel={clientLabel}
              onSelect={(hit) =>
                // Точний фільтр по code1C (коли є) + ім'я для показу в чипі;
                // обидва матчать того самого клієнта.
                setParams({
                  clientCode1C: hit.code1C ?? null,
                  clientName: hit.name,
                })
              }
              onClear={() =>
                setParams({ clientCode1C: null, clientName: null })
              }
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-city"
            >
              Місто
            </label>
            <select
              id="filter-city"
              value={city}
              onChange={(e) => setParam("city", e.target.value || null)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
            >
              <option value="">Усі міста</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-agent"
            >
              Агент
            </label>
            <select
              id="filter-agent"
              value={agent}
              onChange={(e) => setParam("agent", e.target.value || null)}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
            >
              <option value="">Усі агенти</option>
              {agentOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
