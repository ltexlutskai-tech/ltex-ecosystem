"use client";

import {
  CLIENT_COLOR_META,
  CLIENT_COLOR_ORDER,
} from "@/lib/manager/client-color";

interface Props {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}

/**
 * Мультивибір кольору-пріоритету (світлофор). Клікабельні чипи з крапкою-
 * індикатором; кілька обраних = OR (клієнт будь-якого з обраних кольорів).
 */
export function ColorFilter({ label, value, onChange }: Props) {
  function toggle(color: string) {
    if (value.includes(color)) onChange(value.filter((c) => c !== color));
    else onChange([...value, color]);
  }

  return (
    <div className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {CLIENT_COLOR_ORDER.map((color) => {
          const meta = CLIENT_COLOR_META[color];
          const active = value.includes(color);
          return (
            <button
              key={color}
              type="button"
              onClick={() => toggle(color)}
              title={meta.description}
              className={
                active
                  ? "inline-flex items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-2.5 py-1 text-xs text-white"
                  : "inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
              }
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dotClass}`}
              />
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
