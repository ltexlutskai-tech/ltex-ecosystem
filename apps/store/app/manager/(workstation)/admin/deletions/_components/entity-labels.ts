/** Людські назви типів обʼєктів у черзі вилучень (ТЗ 8.0 B8). */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  client: "Клієнт",
  order: "Замовлення",
  sale: "Реалізація",
  cash_order: "Оплата",
  route_sheet: "Маршрутний лист",
  dictionary: "Довідник",
  category: "Категорія",
  product: "Товар",
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

/**
 * Посилання на картку обʼєкта у менеджерці (де воно існує). Повертає null, якщо
 * прямого маршруту немає (напр. довідники — редагуються у своєму розділі).
 */
export function entityHref(
  entityType: string,
  entityId: string,
): string | null {
  switch (entityType) {
    case "client":
      return `/manager/customers/${entityId}`;
    case "order":
      return `/manager/orders/${entityId}`;
    case "sale":
      return `/manager/sales/${entityId}`;
    case "cash_order":
      return `/manager/payments/${entityId}`;
    case "route_sheet":
      return `/manager/routes/${entityId}`;
    default:
      return null;
  }
}
