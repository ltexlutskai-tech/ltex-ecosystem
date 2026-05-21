/**
 * Блок «Замовлення» — статуси документа (← 1С Document.Заказ).
 *
 * Канонічні статуси менеджерського замовлення (узгоджено з user, Етап 2):
 *   - `draft`     — Чернетка (редагується вільно);
 *   - `sent`      — Відправлено в 1С (черга обміну прийняла);
 *   - `posted`    — Проведено (архів) — проведено в 1С, документ заблоковано
 *                   для редагування (ставиться на етапі реальних обмінів);
 *   - `cancelled` — Скасовано.
 *
 * `archived=true` на рівні `Order` відповідає статусу `posted`.
 *
 * Legacy-статуси (`pending`/`approved`/`shipped`/`delivered`) лишаються у
 * META-мапі для коректного відображення вже наявних замовлень (M1.4) та
 * замовлень з магазину/quick-order, але НЕ пропонуються у формі зміни статусу.
 */

export const ORDER_STATUS_META = {
  draft: { label: "Чернетка", color: "gray" },
  sent: { label: "Відправлено в 1С", color: "blue" },
  posted: { label: "Проведено (архів)", color: "green" },
  cancelled: { label: "Скасовано", color: "red" },
  // ─── Legacy (для back-compat display) ─────────────────────────────────────
  pending: { label: "Очікує підтвердження", color: "yellow" },
  approved: { label: "Підтверджено", color: "blue" },
  shipped: { label: "Відправлено", color: "indigo" },
  delivered: { label: "Доставлено", color: "green" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_META;

/**
 * Повний список усіх відомих статусів — використовується для allow-list у
 * фільтрах списку та валідації (приймаємо й legacy-значення).
 */
export const ORDER_STATUS_LIST: OrderStatus[] = [
  "draft",
  "sent",
  "posted",
  "cancelled",
  "pending",
  "approved",
  "shipped",
  "delivered",
];

/**
 * Канонічні статуси менеджерського документа (4) — що пропонуються у UI
 * зміни статусу та беруть участь у графі дозволених переходів.
 */
export const MANAGER_ORDER_STATUSES = [
  "draft",
  "sent",
  "posted",
  "cancelled",
] as const;

export type ManagerOrderStatus = (typeof MANAGER_ORDER_STATUSES)[number];

export function getOrderStatusMeta(status: string): {
  label: string;
  color: string;
} {
  return (
    ORDER_STATUS_META[status as OrderStatus] ?? { label: status, color: "gray" }
  );
}

/**
 * Граф дозволених переходів статусу менеджерського замовлення.
 *
 *   draft   ↔ sent          (відправити в 1С / повернути в чернетку)
 *   draft   → cancelled
 *   sent    → cancelled
 *   posted  → (лок)         — проведено в 1С, переходів немає
 *   cancelled → draft       — повернути скасоване у роботу
 *
 * Legacy-статуси трактуються як `draft` для цілей переходів (можна відправити
 * в 1С / скасувати), щоб старі замовлення лишались керованими.
 */
const TRANSITIONS: Record<ManagerOrderStatus, ManagerOrderStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["draft", "cancelled"],
  posted: [],
  cancelled: ["draft"],
};

/** Чи є статус канонічним менеджерським (один з 4). */
export function isManagerOrderStatus(
  status: string,
): status is ManagerOrderStatus {
  return (MANAGER_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Замовлення «проведене» (заблоковане для будь-яких змін — шапка/товари/статус).
 * Тільки `posted`.
 */
export function isOrderLocked(status: string): boolean {
  return status === "posted";
}

/**
 * Чи можна редагувати шапку/товари замовлення у цьому статусі.
 * Заблоковані: `posted` (проведено в 1С) та `cancelled` (скасоване —
 * лише перегляд, поки не повернуть у чернетку).
 */
export function canEditOrder(status: string): boolean {
  return !isOrderLocked(status) && status !== "cancelled";
}

/**
 * Повертає список дозволених наступних статусів для поточного.
 * Невідомий / legacy статус трактується як `draft`.
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
