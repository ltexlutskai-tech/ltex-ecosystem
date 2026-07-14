"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
 *
 * Клавіатура: ↑/↓ переміщують підсвітку, Enter обирає підсвічену статтю,
 * Esc закриває список (навігація без миші, рішення user 2026-07-14).
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
  // Індекс підсвіченого рядка у `filtered` для навігації стрілками.
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

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

  // Тримаємо активний індекс у межах поточного списку; скидаємо на верх при
  // зміні фільтра.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Прокручуємо підсвічений рядок у зону видимості при навігації стрілками.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const el = list?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);

  const label = (a: ArticleComboItem): string =>
    a.code ? `${a.code} · ${a.name}` : a.name;

  function choose(a: ArticleComboItem): void {
    onChange(a.id);
    setOpen(false);
    setQuery("");
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        e.preventDefault();
        choose(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  return (
    <div className="relative">
      <Input
        value={open ? query : selected ? label(selected) : query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        className={INPUT_CLASS}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {filtered.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                aria-selected={i === activeIndex}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === activeIndex ? "bg-green-50" : "hover:bg-green-50"
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(a)}
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
