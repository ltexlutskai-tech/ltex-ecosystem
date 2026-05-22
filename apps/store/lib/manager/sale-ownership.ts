import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";

/**
 * Блок «Реалізація» — ownership.
 *
 * Скоуп видимості ідентичний Замовленням (реалізація прив'язана до клієнта).
 * `getMyClientCodes1C` перевикористовуємо з `order-ownership.ts` (НЕ дублюємо).
 */
export { getMyClientCodes1C };

/**
 * Check: чи user має право бачити цю конкретну реалізацію?
 * Admin — always true. Manager — only if sale's customer.code1C
 * is в його списку призначених клієнтів.
 */
export async function canViewSale(
  user: Pick<CurrentManager, "id" | "role">,
  saleId: string,
): Promise<boolean> {
  if (user.role === "admin") return true;

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { customer: { select: { code1C: true } } },
  });
  if (!sale?.customer?.code1C) return false;

  const myCodes = await getMyClientCodes1C(user);
  if (myCodes === null) return true;
  return myCodes.includes(sale.customer.code1C);
}
