"use client";

import Link from "next/link";
import { Button, useToast } from "@ltex/ui";

/**
 * `clientId` (MgrClient.id) і `customerId` (Customer.id) — різні namespace-и.
 * Якщо парент знає customer.id з лукапу по code1C — передає; інакше клік на
 * "Створити замовлення" відкриває form з порожнім client-picker-ом.
 */
export function ClientActionButtons({
  customerId,
}: {
  customerId?: string | null;
  clientId?: string;
} = {}) {
  const { toast } = useToast();
  const orderHref = customerId
    ? `/manager/orders/new?clientId=${encodeURIComponent(customerId)}`
    : "/manager/orders/new";
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={orderHref}
        className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Створити замовлення
      </Link>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          toast({
            description:
              "Чат-інтеграцію (Viber/Telegram повідомлення про борг) зробимо у M1.8",
          })
        }
      >
        Повідомити про борг
      </Button>
    </div>
  );
}
