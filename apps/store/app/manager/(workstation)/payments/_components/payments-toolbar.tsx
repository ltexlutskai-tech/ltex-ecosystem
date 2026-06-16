"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button, Input } from "@ltex/ui";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Усі види" },
  { value: "income", label: "Приход" },
  { value: "expense", label: "Расход" },
];

export function PaymentsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [client, setClient] = useState(searchParams.get("client") ?? "");
  const [article, setArticle] = useState(searchParams.get("article") ?? "");
  const [account, setAccount] = useState(searchParams.get("account") ?? "");
  const type = searchParams.get("type") ?? "";
  const archived = searchParams.get("archived") === "true";

  // Розгорнути блок per-column фільтрів, якщо хоч один уже застосовано.
  const hasColumnFilters = !!(client || article || account);
  const [showFilters, setShowFilters] = useState(hasColumnFilters);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
    setFrom(searchParams.get("from") ?? "");
    setTo(searchParams.get("to") ?? "");
    setClient(searchParams.get("client") ?? "");
    setArticle(searchParams.get("article") ?? "");
    setAccount(searchParams.get("account") ?? "");
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
    if (client.trim()) sp.set("client", client.trim());
    else sp.delete("client");
    if (article.trim()) sp.set("article", article.trim());
    else sp.delete("article");
    if (account.trim()) sp.set("account", account.trim());
    else sp.delete("account");
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  function clearAll() {
    setSearch("");
    setFrom("");
    setTo("");
    setClient("");
    setArticle("");
    setAccount("");
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
              placeholder="Пошук за № або клієнтом…"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Шукати
          </Button>
        </form>

        <select
          value={type}
          onChange={(e) => setParam("type", e.target.value || null)}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Фільтр за видом руху"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
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
            checked={archived}
            onChange={(e) =>
              setParam("archived", e.target.checked ? "true" : null)
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
            ? ` (${[client, article, account].filter(Boolean).length})`
            : ""}
        </Button>

        {(search ||
          type ||
          from ||
          to ||
          client ||
          article ||
          account ||
          archived) && (
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
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Назва клієнта…"
              className="h-9"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-article"
            >
              Стаття
            </label>
            <Input
              id="filter-article"
              value={article}
              onChange={(e) => setArticle(e.target.value)}
              placeholder="Стаття руху коштів…"
              className="h-9"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs text-gray-500"
              htmlFor="filter-account"
            >
              Рахунок
            </label>
            <Input
              id="filter-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Банк-рахунок…"
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
    </div>
  );
}
