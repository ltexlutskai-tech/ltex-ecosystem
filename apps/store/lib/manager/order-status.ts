/**
 * Блок «Замовлення» — статуси документа (← 1С Document.Заказ).
 *
 * Канонічні статуси менеджерського замовлення (модель 8.1, рішення user):
 *   - `draft`      — Чернетка: документ робили, але вийшли не зберігаючи
 *                    (автозбереження). Лежить у списку як незавершений.
 *   - `not_posted` — Не проведено: замовлення створене й збережене («Зберегти»),
 *                    але рухи по реєстрах ще НЕ йдуть.
 *   - `posted`     — Проведено: документ зафіксовано (ведуться рухи в реєстрах);
 *                    відправляється в архів (прибирається з головного списку).
 *   - `pending`    — Очікує підтвердження: замовлення з сайту, створене
 *                    автоматично клієнтом; чекає підтвердження й проведення
 *                    менеджером.
 *
 * Незалежно від статусу:
 *   - `isActual` («Актуальне») — замовлення в роботі: потрапляє у «Потреби» й
 *     показується у прайсі (зарезервовано). Знімається вручну або автоматично,
 *     коли замовлення відпрацьоване (стає «Неактуальне»).
 *   - `archived` — історія з 1С (проведені в 1С документи). Проведені у нашій
 *     системі (`posted`) теж ховаються з головного списку (архівний фільтр).
 */

export const ORDER_STATUS_META = {
  draft: { label: "Чернетка", color: "gray" },
  not_posted: { label: "Не проведено", color: "blue" },
  posted: { label: "Проведено", color: "green" },
  pending: { label: "Очікує підтвердження", color: "yellow" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_META;

/**
 * Легасі-лейбли для СТАРИХ документів (історичний 1С-імпорт), чиї статуси більше
 * не пропонуються у системі. Використовуються ЛИШЕ для читабельного показу в
 * архівному перегляді — не входять у allow-list фільтрів/валідації/переходів.
 */
const LEGACY_STATUS_LABELS: Record<string, string> = {
  sent: "Відправлено",
  cancelled: "Скасовано",
  approved: "Підтверджено",
  shipped: "Відвантажено",
  delivered: "Доставлено",
};

/**
 * Повний список канонічних статусів — allow-list для фільтрів списку та
 * валідації. Легасі-статуси сюди НЕ входять (лишились лише в історичних даних).
 */
export const ORDER_STATUS_LIST: OrderStatus[] = [
  "draft",
  "not_posted",
  "posted",
  "pending",
];

/**
 * Канонічні статуси менеджерського документа (4) — що пропонуються у UI зміни
 * статусу та беруть участь у графі дозволених переходів.
 */
export const MANAGER_ORDER_STATUSES = [
  "draft",
  "not_posted",
  "posted",
  "pending",
] as const;

export type ManagerOrderStatus = (typeof MANAGER_ORDER_STATUSES)[number];

export function getOrderStatusMeta(status: string): {
  label: string;
  color: string;
} {
  const meta = ORDER_STATUS_META[status as OrderStatus];
  if (meta) return meta;
  const legacy = LEGACY_STATUS_LABELS[status];
  return { label: legacy ?? status, color: "gray" };
}

/**
 * Граф дозволених переходів статусу менеджерського замовлення.
 *
 *   draft      → not_posted | posted     (зберегти / зберегти й провести)
 *   not_posted → posted | draft
 *   pending    → not_posted | posted     (підтвердити / провести сайтове)
 *   posted     → (лок)                   — проведено, переходів немає
 */
const TRANSITIONS: Record<ManagerOrderStatus, ManagerOrderStatus[]> = {
  draft: ["not_posted", "posted"],
  not_posted: ["posted", "draft"],
  pending: ["not_posted", "posted"],
  posted: [],
};

/** Чи є статус канонічним менеджерським (один з 4). */
export function isManagerOrderStatus(
  status: string,
): status is ManagerOrderStatus {
  return (MANAGER_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Замовлення «проведене» (`posted`) — заблоковане для вільного редагування
 * (див. `canEditOrder`).
 */
export function isOrderLocked(status: string): boolean {
  return status === "posted";
}

/**
 * Чи можна редагувати шапку/товари замовлення.
 *
 * Проведене (`posted`) редагується лише поки воно «Актуальне» (поверніть
 * актуальність, щоб редагувати). Чернетка / Не проведено / Очікує підтвердження
 * — редагуються завжди. Закриття (read-only) контролюється окремо (`closedAt`).
 *
 * @param isActual — прапор `Order.isActual`. Впливає лише на проведене.
 */
export function canEditOrder(status: string, isActual = true): boolean {
  if (isOrderLocked(status)) return isActual === true;
  return true;
}

/**
 * Повертає список дозволених наступних статусів для поточного.
 * Невідомий / легасі статус трактується як `draft`.
 */
export function getAllowedStatusTransitions(
  current: string,
): ManagerOrderStatus[] {
  const key: ManagerOrderStatus = isManagerOrderStatus(current)
    ? current
    : "draft";
  return TRANSITIONS[key];
}

/**
 * Чи дозволений перехід `current → next`?
 * `posted` — фінальний (жоден перехід не дозволено).
 */
export function isTransitionAllowed(current: string, next: string): boolean {
  if (!isManagerOrderStatus(next)) return false;
  return getAllowedStatusTransitions(current).includes(next);
}
