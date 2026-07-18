/**
 * Миттєве оновлення лічильників месенджера між документами.
 *
 * Месенджер відкривається в iframe-вкладці робочого столу, а лічильники
 * (бейдж у сайдбарі + дзвіночок у шапці) живуть у ВЕРХНЬОМУ вікні. Тому коли
 * всередині iframe розмову позначено прочитаною, верхнє вікно про це не знає
 * до наступного polling (30с) — індикатор «висить». Щоб він зникав ОДРАЗУ,
 * iframe шле `postMessage` у top-вікно, а лічильники слухають цю подію і
 * роблять миттєвий refetch.
 */

export const MESSENGER_READ_EVENT = "ltex:messenger-read";

/** Розсилає подію «месенджер прочитано» у поточне + верхнє вікно. */
export function broadcastMessengerRead(): void {
  if (typeof window === "undefined") return;
  const msg = { type: MESSENGER_READ_EVENT };
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

/** Підписка лічильника на подію прочитання. Повертає функцію відписки. */
export function subscribeMessengerRead(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as { type?: unknown } | null;
    if (
      data &&
      typeof data === "object" &&
      data.type === MESSENGER_READ_EVENT
    ) {
      cb();
    }
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
