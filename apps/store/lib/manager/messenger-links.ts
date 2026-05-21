/**
 * Manager «Прайс» — Stage 5a messenger deep-links (pure).
 *
 * Чисті функції, що будують посилання «поділитися текстом» для месенджерів.
 * Працюють і на телефоні, і на компʼютері:
 *  • Telegram — `https://t.me/share/url` (web + native picker).
 *  • WhatsApp — `https://wa.me/?text=` (web + native).
 *  • Viber — на вебі повноцінного share-API немає; `viber://forward?text=`
 *    відкриває застосунок на телефоні (а на десктопі — Viber Desktop, якщо
 *    встановлено). На компʼютері без застосунку лишається кнопка «Скопіювати».
 *
 * Усі функції повертають рядок-URL і не мають побічних ефектів (тестовно).
 */

/**
 * Telegram share. Telegram вимагає НЕпорожній `url`-параметр, інакше picker
 * показує помилку. Передаємо весь текст у `text`, а `url` лишаємо порожнім —
 * Telegram коректно обробляє лише текст. Якщо хочемо приклеїти посилання
 * (напр. сайт/YouTube) — воно вже в тілі тексту.
 */
export function telegramShareUrl(text: string): string {
  // t.me/share/url?url=&text=... — порожній url + текст у text.
  return `https://t.me/share/url?url=&text=${encodeURIComponent(text)}`;
}

/** WhatsApp share — універсальний `wa.me` (без номера = вибір контакту). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Viber forward. На мобільному відкриває Viber з підставленим текстом і
 * пропонує обрати контакт. На десктопі працює лише з Viber Desktop —
 * інакше менеджер користується кнопкою «Скопіювати».
 */
export function viberShareUrl(text: string): string {
  return `viber://forward?text=${encodeURIComponent(text)}`;
}

export type Messenger = "telegram" | "whatsapp" | "viber";

/** Зведена мапа білдерів — зручно ітерувати у UI. */
export const MESSENGER_SHARE_BUILDERS: Record<
  Messenger,
  (text: string) => string
> = {
  telegram: telegramShareUrl,
  whatsapp: whatsappShareUrl,
  viber: viberShareUrl,
};
