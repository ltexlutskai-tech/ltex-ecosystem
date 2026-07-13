"use client";

import { openManagerTab } from "../../../_components/open-manager-tab";

/**
 * Кнопка «Закрити замовлення» на картці замовлення (7.3, як у 1С).
 *
 * Веде на екран «Закриття старих замовлень» з підтягнутим контрагентом
 * (нова вкладка програми): там менеджер бачить усі незакриті замовлення
 * клієнта з позиціями, може перенести потрібні товари в нове замовлення і
 * закрити старі документи.
 *
 * Ховається для вже закритого замовлення.
 */
export function OrderCloseButton({
  isAlreadyClosed,
  mgrClientId,
}: {
  orderId: string;
  isAlreadyClosed: boolean;
  /** MgrClient.id — для префілу контрагента на екрані закриття. */
  mgrClientId?: string | null;
}) {
  if (isAlreadyClosed) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() =>
        openManagerTab(
          mgrClientId
            ? `/manager/closures?clientId=${encodeURIComponent(mgrClientId)}`
            : "/manager/closures",
          "Закриття замовлень",
        )
      }
      className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
    >
      ❌ Закрити замовлення
    </button>
  );
}
