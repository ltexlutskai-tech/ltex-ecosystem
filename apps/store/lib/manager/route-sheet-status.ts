/**
 * Блок «Маршрутний лист» — статуси документа (← 1С Document.МаршрутныйЛист,
 * Enum СтатусыМаршрутногоЛиста).
 *
 * Канонічні статуси (3, узгоджено з аудитом — без «Скасовано»):
 *   - `draft`      — Складається (Составляется) — редагується вільно;
 *   - `dispatched` — Відправлений (Отправлен) — у роботі (виїзд);
 *   - `completed`  — Завершений (Завершен) — документ заблоковано для
 *                    редагування (порт 1С `ВозвратПоЗакритомуМаршрутнику`).
 *
 * `posted=true`/`archived=true` на рівні `RouteSheet` відповідають проведенню
 * в 1С (ставляться на етапі обмінів). Дзеркалить `sale-status.ts`.
 */

export const ROUTE_SHEET_STATUS_META = {
  draft: { label: "Складається", color: "gray" },
  dispatched: { label: "Відправлений", color: "blue" },
  completed: { label: "Завершений", color: "green" },
} as const;

export type RouteSheetStatus = keyof typeof ROUTE_SHEET_STATUS_META;

/** Повний список усіх відомих статусів — allow-list для фільтрів/валідації. */
export const ROUTE_SHEET_STATUS_LIST: RouteSheetStatus[] = [
  "draft",
  "dispatched",
  "completed",
];

export function getRouteSheetStatusMeta(status: string): {
  label: string;
  color: string;
} {
  return (
    ROUTE_SHEET_STATUS_META[status as RouteSheetStatus] ?? {
      label: status,
      color: "gray",
    }
  );
}

/** Чи є статус канонічним (один з 3). */
export function isRouteSheetStatus(status: string): status is RouteSheetStatus {
  return (ROUTE_SHEET_STATUS_LIST as readonly string[]).includes(status);
}

/**
 * Маршрутний лист «завершено» (заблоковано для будь-яких змін шапки/товарів).
 * Тільки `completed` (порт 1С — статус Завершен лочить документ).
 *
 * **Важливо:** сам перехід статусу (наприклад розблокування `completed`)
 * завжди дозволено — lock стосується лише редагування інших полів/дочірніх
 * таблиць. Граф переходів — `ROUTE_SHEET_TRANSITIONS` / `canTransition`.
 */
export function isRouteSheetLocked(status: string): boolean {
  return status === "completed";
}

/**
 * Граф дозволених переходів статусу маршрутного листа (Етап 4).
 *
 *   draft      → dispatched              (Відправити у виїзд)
 *   dispatched → completed               (Завершити день)
 *   dispatched → draft                   (Повернути в роботу — корекція)
 *   completed  → dispatched              (Розблокувати завершений — корекція)
 *
 * Прямого `draft → completed` чи `completed → draft` немає — лише через
 * проміжний `dispatched`.
 */
export const ROUTE_SHEET_TRANSITIONS: Record<
  RouteSheetStatus,
  RouteSheetStatus[]
> = {
  draft: ["dispatched"],
  dispatched: ["completed", "draft"],
  completed: ["dispatched"],
};

/** Повертає список дозволених наступних статусів для поточного. */
export function getAllowedRouteSheetTransitions(
  current: string,
): RouteSheetStatus[] {
  const key: RouteSheetStatus = isRouteSheetStatus(current) ? current : "draft";
  return ROUTE_SHEET_TRANSITIONS[key];
}

/**
 * Чи дозволений перехід `from → next`?
 *
 * - `from === next` (без зміни) трактується як дозволене (no-op).
 * - Невідомий `from`/`next` → false (нелегальний/невідомий стрибок).
 */
export function canTransition(from: string, next: string): boolean {
  if (!isRouteSheetStatus(next)) return false;
  if (from === next) return true;
  if (!isRouteSheetStatus(from)) return false;
  return ROUTE_SHEET_TRANSITIONS[from].includes(next);
}
