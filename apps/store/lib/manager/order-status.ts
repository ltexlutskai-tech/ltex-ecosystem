export const ORDER_STATUS_META = {
  draft: { label: "Чернетка", color: "gray" },
  pending: { label: "Очікує підтвердження", color: "yellow" },
  approved: { label: "Підтверджено", color: "blue" },
  shipped: { label: "Відправлено", color: "indigo" },
  delivered: { label: "Доставлено", color: "green" },
  cancelled: { label: "Скасовано", color: "red" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_META;

export const ORDER_STATUS_LIST: OrderStatus[] = [
  "draft",
  "pending",
  "approved",
  "shipped",
  "delivered",
  "cancelled",
];

export function getOrderStatusMeta(status: string): {
  label: string;
  color: string;
} {
  return (
    ORDER_STATUS_META[status as OrderStatus] ?? { label: status, color: "gray" }
  );
}
