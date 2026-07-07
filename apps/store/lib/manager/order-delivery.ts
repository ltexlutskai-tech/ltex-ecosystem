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
