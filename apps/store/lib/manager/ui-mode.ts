/**
 * Режим оболонки менеджерки (2026-07-14).
 *
 * "classic" — історична 1С-подібна оболонка з рядком вкладок і iframe-ами
 * (кожен документ у своїй вкладці, «в окреме вікно», «показати поруч»).
 * "simple"  — односторінковий інтерфейс: ліва панель + одна робоча область,
 * звичайна клієнтська навігація (без вкладок/iframe).
 *
 * Зберігається у cookie (per-browser) — щоб root-layout міг прочитати режим
 * серверно на КОЖЕН рендер без звернення до БД і без миготіння оболонки.
 * За замовчуванням — "classic" (перехід має бути свідомим і безпечним).
 */
export const UI_MODE_COOKIE = "ltex_mgr_ui_mode";

export type UiMode = "classic" | "simple";

/** Нормалізувати сире значення cookie у валідний режим (дефолт — classic). */
export function parseUiMode(raw: string | undefined | null): UiMode {
  return raw === "simple" ? "simple" : "classic";
}
