"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ресайз колонок таблиці «як в Excel»: тягнеш роздільник праворуч заголовка.
 * Ширини зберігаються у localStorage (стабільні між сеансами). Підтримує
 * мишу і тач (телефон/планшет).
 */
export function useColumnWidths(
  storageKey: string,
  defaults: Record<string, number>,
  min = 40,
): {
  widths: Record<string, number>;
  startResize: (key: string, clientX: number) => void;
  reset: () => void;
} {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(
    null,
  );

  // Відновлення з localStorage (лише валідні ключі).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, number>;
        setWidths((cur) => {
          const next = { ...cur };
          for (const k of Object.keys(defaults)) {
            if (typeof saved[k] === "number" && saved[k] >= min)
              next[k] = saved[k];
          }
          return next;
        });
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback(
    (w: Record<string, number>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(w));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const startResize = useCallback(
    (key: string, clientX: number) => {
      drag.current = { key, startX: clientX, startW: widths[key] ?? min };

      const move = (x: number) => {
        const d = drag.current;
        if (!d) return;
        const w = Math.max(min, d.startW + (x - d.startX));
        setWidths((cur) => ({ ...cur, [d.key]: w }));
      };
      const onMouseMove = (e: MouseEvent) => move(e.clientX);
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches[0]) move(e.touches[0].clientX);
      };
      const end = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", end);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", end);
        document.body.style.userSelect = "";
        setWidths((cur) => {
          persist(cur);
          return cur;
        });
        drag.current = null;
      };
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", end);
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", end);
    },
    [widths, persist, min],
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    persist(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  return { widths, startResize, reset };
}
