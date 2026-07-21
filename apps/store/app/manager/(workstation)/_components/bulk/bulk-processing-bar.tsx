"use client";

import { Button } from "@ltex/ui";

/**
 * Липка панель «Групова обробка» — зʼявляється, коли обрано хоча б один обʼєкт.
 * Показує лічильник, кнопку відкриття діалогу зміни поля та скидання вибірки.
 */
export function BulkProcessingBar({
  count,
  onOpen,
  onClear,
}: {
  count: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-3 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-2.5 shadow-lg">
      <span className="text-sm font-medium text-gray-700">Обрано: {count}</span>
      <Button type="button" size="sm" onClick={onOpen}>
        Групова обробка
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onClear}>
        Зняти виділення
      </Button>
    </div>
  );
}
