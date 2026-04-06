"use client";

import { useState } from "react";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@ltex/shared";
import { updateOrderStatus } from "./actions";

export function OrderStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const [loading, setLoading] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as OrderStatus;
    if (newStatus === currentStatus) return;
    setLoading(true);
    try {
      await updateOrderStatus(orderId, newStatus);
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      disabled={loading}
      className="rounded-md border px-2 py-1 text-xs"
    >
      {ORDER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {ORDER_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
