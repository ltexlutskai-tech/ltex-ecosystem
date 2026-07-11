/**
 * Легасі-список способів доставки (до 7.3). Тепер способи доставки живуть у
 * редагованому довіднику «Способи доставки» (`MgrDeliveryMethod`,
 * `lib/manager/delivery-methods.ts`); цей список — fallback, коли довідник
 * порожній, та джерело лейблів для старих документів зі збереженими кодами
 * delivery|post|pickup.
 */
export const ORDER_DELIVERY_METHODS = [
  { code: "delivery", label: "Доставка" },
  { code: "post", label: "Пошта" },
  { code: "pickup", label: "Самовивіз" },
] as const;

/** Категорія способу доставки для показу полів у формі реалізації. */
export type DeliveryKind = "post" | "delivery" | "pickup" | "other";

/**
 * Класифікація способу доставки (за легасі-кодом або лейблом довідника):
 *  • post     — Нова Пошта → показуємо № відділення НП + ТТН;
 *  • delivery — Доставка (кур'єр/адреса) → показуємо «Адреса доставки»;
 *  • pickup   — Самовивіз → без полів доставки;
 *  • other    — інше (нічого не показуємо).
 */
export function classifyDelivery(
  code: string | null | undefined,
  label?: string | null,
): DeliveryKind {
  if (code === "delivery") return "delivery";
  if (code === "post") return "post";
  if (code === "pickup") return "pickup";
  const l = (label ?? "").toLowerCase();
  if (l.includes("самовив")) return "pickup";
  if (l.includes("пошт") || l.includes("нова")) return "post";
  if (l.includes("достав") || l.includes("кур")) return "delivery";
  return "other";
}

/** Код способу «Доставка» (кур'єр) зі списку опцій — для дефолту з МЛ. */
export function findDeliveryCode(
  options: ReadonlyArray<{ code: string; label: string }>,
): string | null {
  const hit = options.find(
    (o) => classifyDelivery(o.code, o.label) === "delivery",
  );
  return hit?.code ?? null;
}
