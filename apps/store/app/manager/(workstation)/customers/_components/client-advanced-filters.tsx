"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Input } from "@ltex/ui";
import { History, Package, Tag, X } from "lucide-react";

/**
 * Окремі, завжди-видимі розширені зрізи списку клієнтів (не сховані у шторці
 * «Фільтри», не задвоюють загальний пошук):
 *   • Пошук по історії роботи (timeline.body);
 *   • Ключові слова (теги) з режимом усі/будь-яке (AND/OR);
 *   • Асортимент (товар, який клієнт реально бере).
 * Кожен зріз пише свій URL-параметр напряму (текст — з debounce 350 мс).
 */
export function ClientAdvancedFilters({
  allTags = [],
}: {
  /** Усі теги в системі — для випадаючого автокомпліту. */
  allTags?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const spString = searchParams.toString();

  const [history, setHistory] = useState(
    () => searchParams.get("historySearch") ?? "",
  );
  const [assortment, setAssortment] = useState(
    () => searchParams.get("assortmentSearch") ?? "",
  );
  const [tagDraft, setTagDraft] = useState("");

  const keywords = useMemo(
    () =>
      (searchParams.get("keywords") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [searchParams],
  );
  const keywordsOr = searchParams.get("keywordsOr") === "true";

  // Синхронізація текстових полів з URL (напр. після «Скинути»).
  useEffect(() => {
    setHistory(searchParams.get("historySearch") ?? "");
    setAssortment(searchParams.get("assortmentSearch") ?? "");
  }, [searchParams]);

  function pushParam(name: string, value: string | null) {
    const sp = new URLSearchParams(spString);
    if (value === null || value === "") sp.delete(name);
    else sp.set(name, value);
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  // Debounce для «історія» + «асортимент».
  useEffect(() => {
    const current = searchParams.get("historySearch") ?? "";
    const next = history.trim();
    if (next === current) return;
    const t = setTimeout(() => pushParam("historySearch", next || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  useEffect(() => {
    const current = searchParams.get("assortmentSearch") ?? "";
    const next = assortment.trim();
    if (next === current) return;
    const t = setTimeout(
      () => pushParam("assortmentSearch", next || null),
      350,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assortment]);

  function addTag() {
    const w = tagDraft.trim();
    if (!w) return;
    if (keywords.some((k) => k.toLocaleLowerCase() === w.toLocaleLowerCase())) {
      setTagDraft("");
      return;
    }
    pushParam("keywords", [...keywords, w].join(","));
    setTagDraft("");
  }

  function removeTag(tag: string) {
    const next = keywords.filter((k) => k !== tag);
    pushParam("keywords", next.length > 0 ? next.join(",") : null);
  }

  return (
    <div className="grid gap-2 rounded-lg border bg-gray-50/60 p-2 sm:grid-cols-3">
      {/* Історія */}
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500">
          <History className="h-3.5 w-3.5" /> Пошук по історії
        </span>
        <Input
          type="search"
          value={history}
          onChange={(e) => setHistory(e.target.value)}
          placeholder="Текст із запису історії…"
          className="h-8 bg-white"
        />
      </label>

      {/* Ключові слова */}
      <div className="block">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
            <Tag className="h-3.5 w-3.5" /> Ключові слова
          </span>
          {keywords.length > 1 && (
            <div className="flex overflow-hidden rounded border text-xs">
              <button
                type="button"
                onClick={() => pushParam("keywordsOr", null)}
                className={
                  !keywordsOr
                    ? "bg-gray-900 px-1.5 py-0.5 text-white"
                    : "px-1.5 py-0.5"
                }
              >
                усі
              </button>
              <button
                type="button"
                onClick={() => pushParam("keywordsOr", "true")}
                className={
                  keywordsOr
                    ? "bg-gray-900 px-1.5 py-0.5 text-white"
                    : "px-1.5 py-0.5"
                }
              >
                будь-яке
              </button>
            </div>
          )}
        </div>
        {keywords.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {keywords.map((w) => (
              <span
                key={w}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
              >
                {w}
                <button
                  type="button"
                  aria-label={`Прибрати ${w}`}
                  className="hover:text-blue-900"
                  onClick={() => removeTag(w)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          list="ltex-all-tags"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Оберіть або введіть тег…"
          className="h-8 w-full rounded-md border bg-white px-2 text-sm"
        />
        <datalist id="ltex-all-tags">
          {allTags
            .filter((t) => !keywords.includes(t))
            .map((t) => (
              <option key={t} value={t} />
            ))}
        </datalist>
      </div>

      {/* Асортимент */}
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500">
          <Package className="h-3.5 w-3.5" /> Асортимент (товар)
        </span>
        <Input
          type="search"
          value={assortment}
          onChange={(e) => setAssortment(e.target.value)}
          placeholder="Артикул або назва товару…"
          className="h-8 bg-white"
        />
      </label>
    </div>
  );
}
