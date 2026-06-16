/**
 * Блок «Замовлення» — варіанти доставки (← 1С Document.Заказ).
 *
 * Зберігаємо `code` у `Order.deliveryMethod`; label рендериться у UI.
 */
export const ORDER_DELIVERY_METHODS = [
  { code: "delivery", label: "Доставка" },
  { code: "post", label: "Пошта" },
  { code: "pickup", label: "Самовивіз" },
] as const;

export type OrderDeliveryMethod =
  (typeof ORDER_DELIVERY_METHODS)[number]["code"];

export const ORDER_DELIVERY_CODES: string[] = ORDER_DELIVERY_METHODS.map(
  (d) => d.code,
);

export function orderDeliveryLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return ORDER_DELIVERY_METHODS.find((d) => d.code === code)?.label ?? code;
}

/**
 * Лейбл способу доставки для списків Замовлень/Реалізацій
 * (`Order.deliveryMethod` / `Sale.deliveryMethod` зберігають `code`).
 * Реюз `ORDER_DELIVERY_METHODS`; fallback "—" для null/невідомого коду.
 */
export function deliveryLabel(code: string | null): string {
  if (!code) return "—";
  return ORDER_DELIVERY_METHODS.find((d) => d.code === code)?.label ?? "—";
}
