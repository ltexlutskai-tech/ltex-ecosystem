"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Перемикач «Актуальне» для ПРОВЕДЕНОГО замовлення (7.3, як у 1С).
 * PATCH шле вузьке тіло `{ isActual }` — єдине, що дозволено редагувати у
 * проведеному документі. Для чернеток перемикач живе у формі.
 */
export function OrderActualToggle({
  orderId,
  isActual,
  disabled,
}: {
  orderId: string;
  isActual: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActual: !isActual }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          existingOrderNumber?: string;
        };
        // Guard «одне активне на клієнта» — інше замовлення вже актуальне.
        if (body.code === "active_order_exists") {
          setError(
            `У клієнта вже є активне замовлення ${
              body.existingOrderNumber ?? ""
            }. Спершу зніміть з нього «Актуальне».`,
          );
          return;
        }
        setError(body.error ?? `Помилка ${res.status}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => void toggle()}
        title={
          isActual
            ? "Зняти позначку «Актуальне» (замовлення вийде з активного списку і Потреб)"
            : "Повернути замовлення в роботу (позначити актуальним)"
        }
        className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
          isActual
            ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        } ${disabled || pending ? "cursor-default opacity-60" : ""}`}
      >
        {pending ? "…" : isActual ? "✓ Актуальне" : "Неактуальне"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
