"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@ltex/ui";

/**
 * Спільний рядок фільтрів для дрібних регістрів (Фаза 8): пошук + опційні
 * діапазон дат / селект «вид». Перезаписує URL-параметри (page → 1).
 */
export function RegSearchFilter({
  searchLabel = "Пошук за 1С-кодом",
  withDateRange = false,
  kindOptions,
}: {
  searchLabel?: string;
  withDateRange?: boolean;
  kindOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [kind, setKind] = useState(params.get("kind") ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (withDateRange && from) next.set("from", from);
    if (withDateRange && to) next.set("to", to);
    if (kindOptions && kind) next.set("kind", kind);
    const qs = next.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  function reset() {
    setQ("");
    setFrom("");
    setTo("");
    setKind("");
    router.push("?");
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
    >
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        {searchLabel}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-56 rounded-md border border-gray-300 px-2 text-sm"
          placeholder="—"
        />
      </label>

      {withDateRange && (
        <>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Від
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            До
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-gray-300 px-2 text-sm"
            />
          </label>
        </>
      )}

      {kindOptions && (
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Вид
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-md border border-gray-300 px-2 text-sm"
          >
            <option value="">Усі</option>
            {kindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <Button type="submit" size="sm" className="h-9 gap-1.5">
        <Search className="h-4 w-4" />
        Застосувати
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9"
        onClick={reset}
      >
        Скинути
      </Button>
    </form>
  );
}
