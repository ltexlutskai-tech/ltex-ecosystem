/**
 * Миттєве оновлення лічильника непрочитаних чат-повідомлень (клієнтський inbox
 * Telegram/Viber/…) між документами робочого столу.
 *
 * Робочий стіл менеджера рендерить кожен розділ в iframe-вкладці, а бейдж
 * «Месенджери» у сайдбарі живе у ВЕРХНЬОМУ вікні. Коли розмову прочитано
 * всередині iframe (у самому inbox-і АБО у вкладці «Повідомлення» картки
 * клієнта), верхнє вікно про це не знає до наступного polling (30с) — бейдж
 * «висить». Щоб зникав ОДРАЗУ, iframe шле `postMessage` у top-вікно, а бейдж
 * слухає й робить миттєвий refetch.
 *
 * Дзеркалить `lib/messenger/read-broadcast.ts` (внутрішній месенджер), але це
 * ОКРЕМА подія — лічильники різні (клієнтський чат vs чат співробітників).
 */

export const CHAT_READ_EVENT = "ltex:chat-read";

/** Розсилає подію «клієнтський чат прочитано» у поточне + верхнє вікно. */
export function broadcastChatRead(): void {
  if (typeof window === "undefined") return;
  const msg = { type: CHAT_READ_EVENT };
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

/** Підписка бейджа на подію прочитання. Повертає функцію відписки. */
export function subscribeChatRead(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as { type?: unknown } | null;
    if (data && typeof data === "object" && data.type === CHAT_READ_EVENT) {
      cb();
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
