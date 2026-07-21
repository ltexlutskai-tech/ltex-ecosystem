/**
 * Класифікація статусів Нової Пошти (StatusCode) для фонового трекінгу.
 *
 * Довідник кодів НП (TrackingDocument.StatusCode):
 *   1   — чернетка (відправник створив накладну)
 *   2   — видалено
 *   3   — номер не знайдено
 *   4–6 — в дорозі
 *   7,8 — прибув на відділення / поштомат
 *   9,10,11,106 — отримано (в т.ч. з грошовим переказом/післяплатою)
 *   101 — прямує до одержувача (кур'єр)
 *   102,103 — відмова від отримання
 *   105 — припинено зберігання (повернення)
 *   111 — невдала спроба доставки
 */

const DELIVERED = new Set(["9", "10", "11", "106"]);
const FAILED = new Set(["2", "102", "103", "105"]);

/** Відправлення отримано одержувачем. */
export function isDeliveredStatus(code: string | null | undefined): boolean {
  return code != null && DELIVERED.has(code);
}

/** Термінальний статус — далі не змінюється (отримано / повернення / відмова). */
export function isTerminalStatus(code: string | null | undefined): boolean {
  return code != null && (DELIVERED.has(code) || FAILED.has(code));
}

export interface ShipmentSnapshot {
  status: string;
  statusText: string | null;
}

export interface ShipmentTracking {
  status: string;
  statusCode: string;
  scheduledDeliveryDate: string;
}

export interface ShipmentUpdate {
  changed: boolean;
  becameDelivered: boolean;
  status: string;
  statusText: string;
  estimatedDate: string | null;
}

/**
 * Порівнює поточний знімок відправлення з даними трекінгу НП і повертає, що
 * оновити. `becameDelivered` — перехід у «отримано» (для одноразового
 * сповіщення клієнту). `status` зберігаємо як StatusCode (стандарт проєкту).
 */
export function classifyShipmentUpdate(
  snapshot: ShipmentSnapshot,
  tracking: ShipmentTracking,
): ShipmentUpdate {
  const wasDelivered = isDeliveredStatus(snapshot.status);
  const nowDelivered = isDeliveredStatus(tracking.statusCode);
  const changed =
    snapshot.status !== tracking.statusCode ||
    snapshot.statusText !== tracking.status;
  const est = tracking.scheduledDeliveryDate
    ? tracking.scheduledDeliveryDate.slice(0, 10)
    : null;
  return {
    changed,
    becameDelivered: nowDelivered && !wasDelivered,
    status: tracking.statusCode,
    statusText: tracking.status,
    estimatedDate: est,
  };
}
