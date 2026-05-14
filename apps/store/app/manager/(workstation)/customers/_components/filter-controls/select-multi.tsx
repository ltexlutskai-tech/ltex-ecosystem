"use client";

import { useMemo, useRef, useState } from "react";

interface Option {
  id: string;
  label: string;
}

interface Props {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

// Lightweight chip-style multi-select без зовнішніх deps.
// Dropdown — native popover з checkboxами. Chips з ✕ — для зняття.
export function SelectMulti({
  label,
  options,
  value,
  onChange,
  placeholder = "Усі",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedLabels = useMemo(() => {
    const labelMap = new Map(options.map((o) => [o.id, o.label]));
    return value
      .map((id) => ({ id, label: labelMap.get(id) ?? id }))
      .filter((x) => x.label);
  }, [options, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  }

  function removeChip(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="block" ref={wrapperRef}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-h-[36px] flex-wrap items-center gap-1 rounded-md border bg-white px-2 py-1 text-sm text-left shadow-sm hover:bg-gray-50"
      >
        {selectedLabels.length === 0 ? (
          <span className="text-gray-400">{placeholder}</span>
        ) : (
          selectedLabels.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
            >
              {s.label}
              <span
                role="button"
                tabIndex={0}
                aria-label={`Зняти ${s.label}`}
                className="cursor-pointer hover:text-blue-900"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(s.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    removeChip(s.id);
                  }
                }}
              >
                ✕
              </span>
            </span>
          ))
        )}
        <span className="ml-auto text-gray-400">▾</span>
      </button>
      {open && (
        <div className="mt-1 max-h-72 overflow-auto rounded-md border bg-white p-2 shadow">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук…"
            className="mb-2 w-full rounded border px-2 py-1 text-sm"
          />
          {filtered.length === 0 && (
            <p className="px-1 py-2 text-xs text-gray-400">
              Нічого не знайдено
            </p>
          )}
          {filtered.map((o) => {
            const checked = value.includes(o.id);
            return (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.id)}
                />
                <span className="text-sm">{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
