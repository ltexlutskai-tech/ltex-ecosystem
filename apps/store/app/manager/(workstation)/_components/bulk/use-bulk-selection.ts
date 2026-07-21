"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Хук вибірки обʼєктів для «Групової обробки». Тримає `Set<string>` обраних id.
 * Scope MVP — явні чекбокси (без «усі за фільтром» — це пізніший етап).
 */
export interface BulkSelection {
  selected: Set<string>;
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
  /** Перемикнути всі id поточної сторінки (додати всі, або зняти всі). */
  toggleAllOnPage: (pageIds: string[]) => void;
  /** Чи всі id сторінки вже обрані (для стану «головного» чекбокса). */
  allOnPageSelected: (pageIds: string[]) => boolean;
}

export function useBulkSelection(): BulkSelection {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const toggleAllOnPage = useCallback((pageIds: string[]) => {
    setSelected((prev) => {
      const allSelected =
        pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const allOnPageSelected = useCallback(
    (pageIds: string[]) =>
      pageIds.length > 0 && pageIds.every((id) => selected.has(id)),
    [selected],
  );

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      isSelected,
      toggle,
      clear,
      toggleAllOnPage,
      allOnPageSelected,
    }),
    [selected, isSelected, toggle, clear, toggleAllOnPage, allOnPageSelected],
  );
}
