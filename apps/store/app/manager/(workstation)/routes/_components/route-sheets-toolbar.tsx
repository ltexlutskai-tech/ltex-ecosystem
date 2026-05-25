"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Button, Input } from "@ltex/ui";
import {
  ROUTE_SHEET_STATUS_LIST,
  ROUTE_SHEET_STATUS_META,
} from "@/lib/manager/route-sheet-status";

export function RouteSheetsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const status = searchParams.get("status") ?? "";
  const archived = searchParams.get("archived") === "true";

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setFrom(searchParams.get("from") ?? "");
    setTo(searchParams.get("to") ?? "");
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
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function clearAll() {
    setSearch("");
    setFrom("");
    setTo("");
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
              placeholder="Пошук за № або назвою маршруту…"
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
          {ROUTE_SHEET_STATUS_LIST.map((s) => (
            <option key={s} value={s}>
              {ROUTE_SHEET_STATUS_META[s].label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500" htmlFor="rs-from-date">
            З
          </label>
          <Input
            id="rs-from-date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={() => setParam("from", from || null)}
            className="h-9 w-[140px]"
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500" htmlFor="rs-to-date">
            До
          </label>
          <Input
            id="rs-to-date"
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
            checked={archived}
            onChange={(e) =>
              setParam("archived", e.target.checked ? "true" : null)
            }
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Відображати архівні
        </label>

        {(search || status || from || to || archived) && (
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
    </div>
  );
}
