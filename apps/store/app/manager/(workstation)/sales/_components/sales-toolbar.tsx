"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button, Input } from "@ltex/ui";
import { SALE_STATUS_LIST, SALE_STATUS_META } from "@/lib/manager/sale-status";

export function SalesToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [clientName, setClientName] = useState(
    searchParams.get("clientName") ?? "",
  );
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [agent, setAgent] = useState(searchParams.get("agent") ?? "");
  const status = searchParams.get("status") ?? "";
  const clientCode1C = searchParams.get("clientCode1C") ?? "";
  const showArchived = searchParams.get("showArchived") === "true";

  // Розгорнути блок per-column фільтрів, якщо хоч один уже застосовано.
  const hasColumnFilters = !!(clientName || city || agent);
  const [showFilters, setShowFilters] = useState(hasColumnFilters);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setFrom(searchParams.get("from") ?? "");
    setTo(searchParams.get("to") ?? "");
    setClientName(searchParams.get("clientName") ?? "");
    setCity(searchParams.get("city") ?? "");
    setAgent(searchParams.get("agent") ?? "");
  }, [searchParams]);

  function setParam(name: string, value: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function applyAll() {
    const sp = new URLSearchParams(searchParams.toString());
    if (search.trim()) sp.set("search", search.trim());
    else sp.delete("search");
    if (from) sp.set("from", from);
    else sp.delete("from");
    if (to) sp.set("to", to);
    else sp.delete("to");
    if (clientName.trim()) sp.set("clientName", clientName.trim());
    else sp.delete("clientName");
    if (city.trim()) sp.set("city", city.trim());
    else sp.delete("city");
    if (agent.trim()) sp.set("agent", agent.trim());
    else sp.delete("agent");
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function clearAll() {
    setSearch("");
    setFrom("");
    setTo("");
    setClientName("");
    setCity("");
    setAgent("");
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyAll();
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
          <Button type="submit" variant="outline" size="sm">
            Шукати
          </Button>
        </form>

        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value || null)}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Фільтр за статусом"
        >
          <option value="">Усі статуси</option>
          {SALE_STATUS_LIST.map((s) => (
            <option key={s} value={s}>
              {SALE_STATUS_META[s].label}
            </option>
          ))}
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
            onBlur={() => setParam("from", from || null)}
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
            onBlur={() => setParam("to", to || null)}
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
          Відображати архівні
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
            ? ` (${[clientName, city, agent].filter(Boolean).length})`
            : ""}
        </Button>

        {(search ||
          status ||
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyAll();
          }}
          className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-client"
            >
              Клієнт
            </label>
            <Input
              id="filter-client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Назва клієнта…"
              className="h-9"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-city"
            >
              Місто
            </label>
            <Input
              id="filter-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Місто…"
              className="h-9"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-agent"
            >
              Торговий агент
            </label>
            <Input
              id="filter-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="Торговий агент…"
              className="h-9"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="outline" size="sm" className="h-9">
              Застосувати фільтри
            </Button>
          </div>
        </form>
      )}

      {clientCode1C && (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <span>Фільтр по клієнту:</span>
          <code className="font-mono">{clientCode1C}</code>
          <button
            type="button"
            onClick={() => setParam("clientCode1C", null)}
            className="ml-auto inline-flex items-center text-blue-700 hover:text-blue-900"
            aria-label="Скинути фільтр клієнта"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
