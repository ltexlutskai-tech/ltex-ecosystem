"use client";

import Link from "next/link";
import { Button, useToast } from "@ltex/ui";
import { ClientMarkDeletionButton } from "./client-mark-deletion-button";

/**
 * `clientId` (MgrClient.id) і `customerId` (Customer.id) — різні namespace-и.
 *
 * • «Створити замовлення» / «Створити реалізацію» — сторінки `orders/new` та
 *   `sales/new` чекають `Customer.id` у `?clientId` (prefill через
 *   `prisma.customer.findUnique`). Тому використовуємо `customerId`.
 * • «Створити оплату» — `payments/new` (standalone-режим) чекає `MgrClient.id`
 *   у `?clientId`. Тому використовуємо `clientId`.
 *
 * Якщо парент не знає `customerId` (немає Customer-дзеркала по code1C) — лінк
 * відкриває форму з порожнім client-picker-ом (graceful degradation).
 */
export function ClientActionButtons({
  customerId,
  clientId,
  canEdit = false,
}: {
  customerId?: string | null;
  clientId?: string;
  /** Право редагувати клієнта — гейт для кнопки «Позначити на вилучення». */
  canEdit?: boolean;
} = {}) {
  const { toast } = useToast();
  const orderHref = customerId
    ? `/manager/orders/new?clientId=${encodeURIComponent(customerId)}`
    : "/manager/orders/new";
  const saleHref = customerId
    ? `/manager/sales/new?clientId=${encodeURIComponent(customerId)}`
    : "/manager/sales/new";
  const paymentHref = clientId
    ? `/manager/payments/new?clientId=${encodeURIComponent(clientId)}`
    : "/manager/payments/new";
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={orderHref}
        className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Створити замовлення
      </Link>
      <Link
        href={saleHref}
        className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Створити реалізацію
      </Link>
      <Link
        href={paymentHref}
        className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Створити оплату
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
      {canEdit && clientId && <ClientMarkDeletionButton clientId={clientId} />}
    </div>
  );
}
