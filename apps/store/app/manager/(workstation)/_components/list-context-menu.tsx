"use client";

import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Один пункт контекстного меню списку (1С-стиль).
 * `action` — клікабельний рядок; `separator` — горизонтальна лінія-розділювач.
 * Архітектура розширювана: нові пункти описуються конфігом у `buildItems`.
 */
export type ContextMenuItem =
  | { type: "action"; label: string; onSelect: () => void; disabled?: boolean }
  | { type: "separator" };

interface Props {
  /** Чи відкрите меню. */
  open: boolean;
  /** Координати курсора / дотику (viewport-fixed). */
  x: number;
  y: number;
  /** Пункти меню. */
  items: ContextMenuItem[];
  /** Закрити меню (без виконання дії). */
  onClose: () => void;
}

/**
 * Спільне контекстне меню рядків менеджерських списків (Замовлення / Реалізації /
 * Оплати). `@ltex/ui` не має Radix ContextMenu, тому це власний позиціонований
 * popup — механіка дзеркалить `prices/_components/product-row-menu.tsx`: рендер у
 * портал у `document.body`, `position:fixed` за координатами, утримання у viewport,
 * закриття по кліку-поза / Escape / scroll / resize.
 */
export function ListContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: Props): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Утримуємо popup у межах viewport (зсуваємо вліво/вгору якщо вилазить).
  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 240;
    const height = el?.offsetHeight ?? 280;
    const pad = 8;
    const left = Math.min(x, window.innerWidth - width - pad);
    const top = Math.min(y, window.innerHeight - height - pad);
    setCoords({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [open, x, y, items.length]);

  // Закриття: клік-поза-меню, Escape, скрол/resize.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: coords?.left ?? x,
        top: coords?.top ?? y,
      }}
      // visibility:hidden до першого виміру щоб не блимало у (0,0).
      className={`z-50 min-w-[220px] overflow-hidden rounded-md border bg-white py-1 text-sm shadow-lg ${
        coords ? "" : "invisible"
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) =>
        item.type === "separator" ? (
          <div key={`sep-${idx}`} className="my-1 border-t" />
        ) : (
          <button
            key={`item-${idx}-${item.label}`}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
            className={`block w-full px-3 py-2 text-left ${
              item.disabled
                ? "cursor-default text-gray-300"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
