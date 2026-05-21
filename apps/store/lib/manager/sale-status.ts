/**
 * Блок «Реалізація» — статуси документа (← 1С Document.РеализацияТоваровУслуг).
 *
 * Канонічні статуси менеджерської реалізації (узгоджено з user, Етап 1):
 *   - `draft`     — Чернетка (редагується вільно);
 *   - `sent`      — Відправлено в 1С (черга обміну прийняла);
 *   - `posted`    — Проведено (архів) — проведено в 1С, документ заблоковано
 *                   для редагування (ставиться на етапі реальних обмінів);
 *   - `cancelled` — Скасовано.
 *
 * `archived=true` на рівні `Sale` відповідає статусу `posted`.
 *
 * Дзеркалить `order-status.ts` (граф переходів буде доданий у Етапі 3 разом
 * із редагуванням/проведенням; у Етапі 1 використовуються лише label/color
 * та allow-list для фільтра списку).
 */

export const SALE_STATUS_META = {
  draft: { label: "Чернетка", color: "gray" },
  sent: { label: "Відправлено в 1С", color: "blue" },
  posted: { label: "Проведено (архів)", color: "green" },
  cancelled: { label: "Скасовано", color: "red" },
} as const;

export type SaleStatus = keyof typeof SALE_STATUS_META;

/** Повний список усіх відомих статусів — allow-list для фільтрів/валідації. */
export const SALE_STATUS_LIST: SaleStatus[] = [
  "draft",
  "sent",
  "posted",
  "cancelled",
];

export function getSaleStatusMeta(status: string): {
  label: string;
  color: string;
} {
  return (
    SALE_STATUS_META[status as SaleStatus] ?? { label: status, color: "gray" }
  );
}
