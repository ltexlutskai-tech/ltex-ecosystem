"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import type { ConfigItem } from "@/lib/manager/view-defaults";

interface Props {
  items: ConfigItem[];
  labels: Record<string, string>;
  onChange: (next: ConfigItem[]) => void;
  disabled?: boolean;
}

/**
 * Список колонок/фільтрів з перетягуванням (drag-and-drop) для зміни порядку +
 * чекбокс видимості. Порядок переписується у полі `order` після кожного
 * переміщення.
 */
export function ViewCustomizerList({
  items,
  labels,
  onChange,
  disabled,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function reorder(from: number, to: number) {
    if (from === to) return;
    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    if (!moved) return;
    arr.splice(to, 0, moved);
    onChange(arr.map((it, idx) => ({ ...it, order: idx + 1 })));
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
          draggable={!disabled}
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => {
            if (disabled || dragIndex === null) return;
            e.preventDefault();
            setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) reorder(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={`flex items-center gap-2 px-3 py-2 text-sm ${
            disabled ? "" : "cursor-grab active:cursor-grabbing"
          } ${overIndex === i && dragIndex !== null && dragIndex !== i ? "bg-blue-50" : ""}`}
        >
          <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
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
