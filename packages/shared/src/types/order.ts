export const ORDER_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Чернетка",
  pending: "Очікує підтвердження",
  confirmed: "Підтверджено",
  processing: "В обробці",
  shipped: "Відправлено",
  delivered: "Доставлено",
  cancelled: "Скасовано",
};

export interface Order {
  id: string;
  code1C: string | null;
  customerId: string;
  status: OrderStatus;
  totalEur: number;
  totalUah: number;
  exchangeRate: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  lotId: string;
  productId: string;
  priceEur: number;
  weight: number;
  quantity: number;
}
