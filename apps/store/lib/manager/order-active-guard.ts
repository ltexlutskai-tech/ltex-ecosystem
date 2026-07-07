import { prisma } from "@ltex/db";

/**
 * Правило «одне активне замовлення на клієнта» (7.3, як у 1С).
 *
 * Активне = `isActual=true AND archived=false AND closedAt IS NULL`.
 * Використовується при створенні замовлення (POST) та при поверненні
 * замовлення в «Актуальне» (PATCH `{ isActual: true }`).
 *
 * Повертає інше активне замовлення клієнта (окрім `excludeOrderId`), або null.
 */
export async function findOtherActiveOrder(
  customerId: string,
  excludeOrderId?: string,
): Promise<{
  id: string;
  code1C: string | null;
  number1C: string | null;
} | null> {
  return prisma.order.findFirst({
    where: {
      customerId,
      isActual: true,
      archived: false,
      closedAt: null,
      ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
    },
    select: { id: true, code1C: true, number1C: true },
  });
}

/** Ролі, яким дозволено форсувати друге активне замовлення. */
export const CAN_FORCE_ACTIVE_ROLES = [
  "admin",
  "owner",
  "senior_manager",
] as const;

export function canForceActive(role: string): boolean {
  return (CAN_FORCE_ACTIVE_ROLES as readonly string[]).includes(role);
}
