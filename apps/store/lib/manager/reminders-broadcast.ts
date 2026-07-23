/**
 * Миттєве оновлення лічильника нагадувань без перезавантаження сторінки.
 *
 * Сторінка «Нагадування» живе в iframe-вкладці робочого столу, а бейдж
 * лічильника — у ВЕРХНЬОМУ вікні (сайдбар). Коли нагадування виконано/
 * відкладено/видалено всередині iframe, верхнє вікно дізналось би про це лише
 * на наступному polling (30с). Щоб бейдж оновлювався ОДРАЗУ — iframe шле
 * `postMessage` у top-вікно, бейдж слухає і робить миттєвий refetch.
 * (Дзеркалить патерн `lib/messenger/read-broadcast.ts`.)
 */

export const REMINDERS_CHANGED_EVENT = "ltex:reminders-changed";

/** Розсилає подію «нагадування змінились» у поточне + верхнє вікно. */
export function broadcastRemindersChanged(): void {
  if (typeof window === "undefined") return;
  const msg = { type: REMINDERS_CHANGED_EVENT };
  const origin = window.location.origin;
  try {
    window.postMessage(msg, origin);
  } catch {
    // ignore
  }
  try {
    if (window.top && window.top !== window) {
      window.top.postMessage(msg, origin);
    }
  } catch {
    // cross-origin top (не наш кейс) — ігноруємо
  }
}

/** Підписка лічильника на зміну нагадувань. Повертає функцію відписки. */
export function subscribeRemindersChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as { type?: unknown } | null;
    if (
      data &&
      typeof data === "object" &&
      data.type === REMINDERS_CHANGED_EVENT
    ) {
      cb();
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
