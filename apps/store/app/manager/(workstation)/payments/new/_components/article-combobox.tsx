"use client";

import { useMemo, useRef, useState } from "react";
import { Input } from "@ltex/ui";

export interface ArticleComboItem {
  id: string;
  code: string | null;
  name: string;
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

/**
 * Пошуковий вибір статті руху коштів: вводиш текст — список фільтрується за
 * збігом символів (у назві або коді). Клієнтський фільтр (довідник малий).
 */
export function ArticleCombobox({
  items,
  value,
  onChange,
  placeholder = "Почніть вводити назву статті…",
}: {
  items: ArticleComboItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = items.find((a) => a.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.code ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [items, query]);

  const label = (a: ArticleComboItem): string =>
    a.code ? `${a.code} · ${a.name}` : a.name;

  return (
    <div className="relative">
      <Input
        value={open ? query : selected ? label(selected) : query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        className={INPUT_CLASS}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-green-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(a.id);
                  setOpen(false);
                  setQuery("");
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
              >
                {label(a)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
          Нічого не знайдено
        </div>
      )}
    </div>
  );
}
