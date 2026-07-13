import type { Prisma } from "@ltex/db";

/**
 * Авто-створення «Реалізації» з сайтового замовлення (8.1).
 *
 * Замовлення з сайту, що містять КОНКРЕТНІ лоти (клієнт обрав конкретний
 * мішок), одразу отримують пов'язану реалізацію (`Sale.orderId`) зі статусом
 * `pending` («Очікує підтвердження»). Реалізація НЕ проведена — рухи по
 * реєстрах (склад/борг/собівартість) з'являться лише при проведенні менеджером.
 *
 * Виконується у ТІЙ САМІЙ транзакції, що й створення замовлення, щоб документ
 * і його реалізація були атомарні.
 */

export interface SaleFromOrderItem {
  productId: string;
  lotId: string | null;
  barcode: string | null;
  priceEur: number;
  weight: number;
  quantity: number;
}

export interface SaleFromOrderInput {
  orderId: string;
  customerId: string;
  assignedAgentUserId: string | null;
  exchangeRate: number;
  /** Усі позиції замовлення (фільтруються всередині на ті, що мають lotId). */
  items: SaleFromOrderItem[];
}

/**
 * Створює pending-реалізацію лише з позицій, що мають конкретний лот
 * (`lotId != null`). Якщо таких немає — нічого не робить і повертає `null`.
 */
export async function createPendingSaleForOrderTx(
  tx: Prisma.TransactionClient,
  input: SaleFromOrderInput,
): Promise<{ id: string } | null> {
  const lotItems = input.items.filter((i) => i.lotId != null);
  if (lotItems.length === 0) return null;

  const rate = input.exchangeRate > 0 ? input.exchangeRate : 0;
  const totalEur = lotItems.reduce((sum, i) => sum + i.priceEur, 0);
  const totalUah = Math.round(totalEur * rate);

  const sale = await tx.sale.create({
    data: {
      customerId: input.customerId,
      status: "pending",
      archived: false,
      isActual: true,
      totalEur,
      totalUah,
      exchangeRateEur: rate,
      exchangeRateUsd: 0,
      orderId: input.orderId,
      assignedAgentUserId: input.assignedAgentUserId,
      notes:
        "Автоматично створено з сайтового замовлення (очікує підтвердження)",
      items: {
        create: lotItems.map((i) => ({
          productId: i.productId,
          lotId: i.lotId,
          barcode: i.barcode,
          pricePerKg:
            i.weight > 0 ? Math.round((i.priceEur / i.weight) * 100) / 100 : 0,
          priceEur: i.priceEur,
          weight: i.weight,
          quantity: i.quantity,
        })),
      },
    },
    select: { id: true },
  });

  return sale;
}
