"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export interface SearchableOption {
  id: string;
  label: string;
}

/**
 * Комбобокс із пошуком: користувач вводить текст — список фільтрується за
 * співпадінням символів (замість гортання повного довідника). Для великих
 * довідників статей/способів/тощо. Клавіатура: ↑↓ + Enter, Esc — закрити.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Почніть вводити…",
  emptyLabel = "— не вибрано —",
  allowEmpty = true,
  disabled = false,
  id,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(optId: string) {
    onChange(optId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className="relative">
      {open ? (
        <input
          id={id}
          autoFocus
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const opt = filtered[active];
              if (opt) pick(opt.id);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-green-500 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      ) : (
        <button
          type="button"
          id={id}
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 text-left text-sm hover:border-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
        >
          <span className={selected ? "text-gray-800" : "text-gray-400"}>
            {selected ? selected.label : emptyLabel}
          </span>
          <span className="flex items-center gap-1">
            {selected && allowEmpty && !disabled && (
              <X
                className="h-4 w-4 text-gray-400 hover:text-gray-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                aria-label="Очистити"
              />
            )}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </span>
        </button>
      )}

      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {allowEmpty && (
            <li>
              <button
                type="button"
                onClick={() => pick("")}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50"
              >
                {emptyLabel}
              </button>
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">
              Нічого не знайдено
            </li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.id)}
                  className={`block w-full px-3 py-1.5 text-left text-sm ${
                    i === active
                      ? "bg-green-50 text-green-800"
                      : "text-gray-800"
                  } ${o.id === value ? "font-medium" : ""}`}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
