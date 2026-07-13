/**
 * Блок «Реалізація» — статуси документа (← 1С Document.РеализацияТоваровУслуг).
 *
 * Канонічні статуси менеджерської реалізації (модель 8.1, узгоджено з
 * «Замовленнями» — рішення user): ті самі 4 статуси, що й у `order-status.ts`.
 *   - `draft`      — Чернетка: документ робили, але вийшли не зберігаючи
 *                    (автозбереження). Лежить у списку як незавершений.
 *   - `not_posted` — Не проведено: реалізація створена й збережена («Зберегти»),
 *                    але рухи по реєстрах ще НЕ йдуть.
 *   - `posted`     — Проведено: документ зафіксовано (ведуться рухи в реєстрах);
 *                    відправляється в архів (прибирається з головного списку).
 *   - `pending`    — Очікує підтвердження: реалізація, авто-створена з сайтового
 *                    замовлення з конкретними лотами; чекає підтвердження й
 *                    проведення менеджером.
 *
 * `archived=true` на рівні `Sale` відповідає статусу `posted`.
 *
 * Дзеркалить `order-status.ts` (граф переходів + легасі-лейбли для історичних
 * 1С-документів). Легасі `sent`/`cancelled` лишились лише для читабельного
 * показу історичних документів — НЕ у фільтрах/переходах.
 */

export const SALE_STATUS_META = {
  draft: { label: "Чернетка", color: "gray" },
  not_posted: { label: "Не проведено", color: "blue" },
  posted: { label: "Проведено", color: "green" },
  pending: { label: "Очікує підтвердження", color: "yellow" },
} as const;

export type SaleStatus = keyof typeof SALE_STATUS_META;

/**
 * Легасі-лейбли для СТАРИХ документів (історичний 1С-імпорт), чиї статуси більше
 * не пропонуються у системі. Використовуються ЛИШЕ для читабельного показу в
 * архівному перегляді — не входять у allow-list фільтрів/валідації/переходів.
 */
const LEGACY_STATUS_LABELS: Record<string, string> = {
  sent: "Відправлено в 1С",
  cancelled: "Скасовано",
  approved: "Підтверджено",
  shipped: "Відвантажено",
  delivered: "Доставлено",
};

/**
 * Повний список канонічних статусів — allow-list для фільтрів списку та
 * валідації. Легасі-статуси сюди НЕ входять (лишились лише в історичних даних).
 */
export const SALE_STATUS_LIST: SaleStatus[] = [
  "draft",
  "not_posted",
  "posted",
  "pending",
];

/**
 * Канонічні статуси менеджерської реалізації (4) — що пропонуються у UI зміни
 * статусу та беруть участь у графі дозволених переходів.
 */
export const MANAGER_SALE_STATUSES = [
  "draft",
  "not_posted",
  "posted",
  "pending",
] as const;

export type ManagerSaleStatus = (typeof MANAGER_SALE_STATUSES)[number];

export function getSaleStatusMeta(status: string): {
  label: string;
  color: string;
} {
  const meta = SALE_STATUS_META[status as SaleStatus];
  if (meta) return meta;
  const legacy = LEGACY_STATUS_LABELS[status];
  return { label: legacy ?? status, color: "gray" };
}

/**
 * Граф дозволених переходів статусу менеджерської реалізації (дзеркалить
 * замовлення):
 *
 *   draft      → not_posted | posted     (зберегти / зберегти й провести)
 *   not_posted → posted | draft
 *   pending    → not_posted | posted     (підтвердити / провести сайтове)
 *   posted     → (лок)                   — проведено, переходів немає
 */
const SALE_TRANSITIONS: Record<ManagerSaleStatus, ManagerSaleStatus[]> = {
  draft: ["not_posted", "posted"],
  not_posted: ["posted", "draft"],
  pending: ["not_posted", "posted"],
  posted: [],
};

/** Чи є статус канонічним менеджерським (один з 4). */
export function isManagerSaleStatus(
  status: string,
): status is ManagerSaleStatus {
  return (MANAGER_SALE_STATUSES as readonly string[]).includes(status);
}

/**
 * Реалізація «проведена» (`posted`) — заблокована для будь-яких змін
 * (шапка/товари/статус).
 */
export function isSaleLocked(status: string): boolean {
  return status === "posted";
}

/**
 * Чи можна редагувати шапку/товари реалізації.
 *
 * Заблоковані лише проведені (`posted`). Чернетка / Не проведено / Очікує
 * підтвердження — редагуються завжди.
 */
export function canEditSale(status: string): boolean {
  return !isSaleLocked(status);
}

/**
 * Повертає список дозволених наступних статусів для поточного.
 * Невідомий / легасі статус трактується як `draft`.
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
