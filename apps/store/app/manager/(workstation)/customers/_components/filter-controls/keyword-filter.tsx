"use client";

import { useState } from "react";

interface Props {
  label: string;
  value: string[];
  /** true → OR (будь-яке слово); false/undefined → AND (усі слова). */
  orMode?: boolean;
  onChange: (v: string[]) => void;
  onModeChange: (orMode: boolean) => void;
}

/**
 * Фільтр по ключових словах (тегах): додавання слів → чипи + перемикач
 * «усі / будь-яке» (AND/OR). Порт 1С `ФільтрКлючовіСлова` + тумблер «або».
 */
export function KeywordFilter({
  label,
  value,
  orMode,
  onChange,
  onModeChange,
}: Props) {
  const [draft, setDraft] = useState("");

  function add() {
    const w = draft.trim();
    if (!w) return;
    if (value.some((v) => v.toLocaleLowerCase() === w.toLocaleLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, w]);
    setDraft("");
  }

  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {label}
        </span>
        {value.length > 1 && (
          <div className="flex overflow-hidden rounded-md border text-xs">
            <button
              type="button"
              onClick={() => onModeChange(false)}
              className={
                !orMode ? "bg-gray-900 px-2 py-0.5 text-white" : "px-2 py-0.5"
              }
            >
              усі
            </button>
            <button
              type="button"
              onClick={() => onModeChange(true)}
              className={
                orMode ? "bg-gray-900 px-2 py-0.5 text-white" : "px-2 py-0.5"
              }
            >
              будь-яке
            </button>
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {value.map((w) => (
            <span
              key={w}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
            >
              {w}
              <button
                type="button"
                aria-label={`Прибрати ${w}`}
                className="hover:text-blue-900"
                onClick={() => onChange(value.filter((v) => v !== w))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Слово + Enter"
        className="w-full rounded-md border px-2 py-1 text-sm shadow-sm"
      />
    </div>
  );
}
