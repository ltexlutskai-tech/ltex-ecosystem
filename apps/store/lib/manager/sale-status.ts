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
 * Дзеркалить `order-status.ts` (граф переходів — Етап 2: редагування/
 * проведення; у Етапі 1 використовувалися лише label/color та allow-list).
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

/**
 * Канонічні статуси менеджерської реалізації (4) — пропонуються у UI зміни
 * статусу та беруть участь у графі дозволених переходів. (Тут збігається з
 * `SALE_STATUS_LIST`, бо у Реалізації немає legacy-статусів.)
 */
export const MANAGER_SALE_STATUSES = [
  "draft",
  "sent",
  "posted",
  "cancelled",
] as const;

export type ManagerSaleStatus = (typeof MANAGER_SALE_STATUSES)[number];

export function getSaleStatusMeta(status: string): {
  label: string;
  color: string;
} {
  return (
    SALE_STATUS_META[status as SaleStatus] ?? { label: status, color: "gray" }
  );
}

/**
 * Граф дозволених переходів статусу менеджерської реалізації (дзеркалить
 * замовлення):
 *
 *   draft   ↔ sent          (відправити в 1С / повернути в чернетку)
 *   draft   → cancelled
 *   sent    → cancelled
 *   posted  → (лок)         — проведено в 1С, переходів немає
 *   cancelled → draft       — повернути скасоване у роботу
 */
const SALE_TRANSITIONS: Record<ManagerSaleStatus, ManagerSaleStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["draft", "cancelled"],
  posted: [],
  cancelled: ["draft"],
};

/** Чи є статус канонічним менеджерським (один з 4). */
export function isManagerSaleStatus(
  status: string,
): status is ManagerSaleStatus {
  return (MANAGER_SALE_STATUSES as readonly string[]).includes(status);
}

/**
 * Реалізація «проведена» (заблокована для будь-яких змін — шапка/товари/статус).
 * Тільки `posted`.
 */
export function isSaleLocked(status: string): boolean {
  return status === "posted";
}

/**
 * Чи можна редагувати шапку/товари реалізації у цьому статусі.
 * Заблоковані: `posted` (проведено в 1С) та `cancelled` (скасоване —
 * лише перегляд, поки не повернуть у чернетку).
 */
export function canEditSale(status: string): boolean {
  return !isSaleLocked(status) && status !== "cancelled";
}

/**
 * Повертає список дозволених наступних статусів для поточного.
 * Невідомий статус трактується як `draft`.
 */
export function getAllowedSaleTransitions(
  current: string,
): ManagerSaleStatus[] {
  const key: ManagerSaleStatus = isManagerSaleStatus(current)
    ? current
    : "draft";
  return SALE_TRANSITIONS[key];
}

/**
 * Чи дозволений перехід `current → next`?
 * `posted` — фінальний (жоден перехід не дозволено).
 */
export function isSaleTransitionAllowed(
  current: string,
  next: string,
): boolean {
  if (!isManagerSaleStatus(next)) return false;
  return getAllowedSaleTransitions(current).includes(next);
}
