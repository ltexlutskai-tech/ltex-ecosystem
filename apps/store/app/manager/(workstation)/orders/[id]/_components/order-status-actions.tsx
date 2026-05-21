"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ltex/ui";
import {
  getAllowedStatusTransitions,
  type ManagerOrderStatus,
} from "@/lib/manager/order-status";

const STATUS_ACTION_LABEL: Record<ManagerOrderStatus, string> = {
  draft: "Повернути в чернетку",
  sent: "Відправити в 1С",
  posted: "Провести в 1С",
  cancelled: "Скасувати замовлення",
};

/**
 * Дії зміни статусу для read-only режиму перегляду замовлення
 * (статуси `cancelled` — повернути в чернетку). PATCH передає тільки `status`
 * + поточні items (повна заміна). Щоб не дублювати товари тут, статус
 * змінюємо окремим лёгким викликом — backend вимагає items, тож передаємо
 * наявні через preloaded snapshot.
 */
export function OrderStatusActions({
  orderId,
  status,
  itemsSnapshot,
}: {
  orderId: string;
  status: string;
  /** Поточні items замовлення (backend вимагає їх у PATCH — повна заміна). */
  itemsSnapshot: Array<{
    productId: string;
    lotId: string | null;
    weight: number;
    quantity: number;
    priceEur: number;
  }>;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = getAllowedStatusTransitions(status);
  if (allowed.length === 0) return null;

  async function changeStatus(next: ManagerOrderStatus): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsSnapshot, status: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {allowed.map((next) => (
          <Button
            key={next}
            type="button"
            size="sm"
            variant={next === "cancelled" ? "outline" : "default"}
            disabled={submitting}
            onClick={() => changeStatus(next)}
            className={
              next === "cancelled"
                ? "border-red-300 text-red-600 hover:bg-red-50"
                : ""
            }
          >
            {STATUS_ACTION_LABEL[next]}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
