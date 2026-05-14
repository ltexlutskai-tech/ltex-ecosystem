"use client";

import type { ConfigItem } from "@/lib/manager/view-defaults";

interface Props {
  items: ConfigItem[];
  labels: Record<string, string>;
  onChange: (next: ConfigItem[]) => void;
  disabled?: boolean;
}

export function ViewCustomizerList({
  items,
  labels,
  onChange,
  disabled,
}: Props) {
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.map((it, idx) => {
      if (idx === i) return { ...items[j]!, order: i + 1 };
      if (idx === j) return { ...items[i]!, order: j + 1 };
      return { ...it, order: idx + 1 };
    });
    onChange(next);
  }

  function toggleVisible(i: number, visible: boolean) {
    const next = items.map((it, idx) =>
      idx === i ? { ...it, visible } : { ...it },
    );
    onChange(next);
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-md border bg-white">
      {items.map((item, i) => (
        <li
          key={item.key}
          className="flex items-center gap-2 px-3 py-2 text-sm"
        >
          <div className="flex flex-col">
            <button
              type="button"
              aria-label={`Перемістити ${labels[item.key] ?? item.key} вгору`}
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
              className="rounded p-0.5 text-xs hover:bg-gray-100 disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label={`Перемістити ${labels[item.key] ?? item.key} вниз`}
              disabled={disabled || i === items.length - 1}
              onClick={() => move(i, 1)}
              className="rounded p-0.5 text-xs hover:bg-gray-100 disabled:opacity-30"
            >
              ▼
            </button>
          </div>
          <input
            type="checkbox"
            checked={item.visible}
            disabled={disabled}
            aria-label={`Показати ${labels[item.key] ?? item.key}`}
            onChange={(e) => toggleVisible(i, e.target.checked)}
          />
          <span className="flex-1 truncate text-gray-800">
            {labels[item.key] ?? item.key}
          </span>
          <span className="text-xs text-gray-400">{item.order}</span>
        </li>
      ))}
    </ul>
  );
}
