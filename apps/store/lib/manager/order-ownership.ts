import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";

/**
 * Ролі з доступом до ВСІХ клієнтів/замовлень (no ownership restriction).
 * `analyst` тут, бо формує «Потреби» вручну, заводячи замовлення за будь-якого
 * клієнта (read + create + edit усіх замовлень).
 */
const ALL_CLIENTS_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "owner",
  "analyst",
]);

/**
 * Returns code1C-и усіх MgrClient-ів, призначених на user-а
 * (agentUserId === user.id OR хтось у ClientAssignment).
 *
 * - `admin`/`owner`/`analyst` → `null` ("no restriction" — будь-який order видимий)
 * - `manager` → масив code1C (можливо порожній → 0 orders видно)
 */
export async function getMyClientCodes1C(
  user: Pick<CurrentManager, "id" | "role">,
): Promise<string[] | null> {
  if (ALL_CLIENTS_ROLES.has(user.role)) return null;

  const clients = await prisma.mgrClient.findMany({
    where: {
      OR: [
        { agentUserId: user.id },
        { assignments: { some: { userId: user.id } } },
      ],
      code1C: { not: null },
    },
    select: { code1C: true },
  });

  const codes: string[] = [];
  for (const c of clients) {
    if (c.code1C) codes.push(c.code1C);
  }
  return codes;
}

/**
 * Check: чи user має право бачити цей конкретний order?
 * Admin — always true. Manager — only if order's customer.code1C
 * is в його списку призначених клієнтів.
 */
export async function canViewOrder(
  user: Pick<CurrentManager, "id" | "role">,
  orderId: string,
): Promise<boolean> {
  if (ALL_CLIENTS_ROLES.has(user.role)) return true;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      assignedAgentUserId: true,
      customer: { select: { code1C: true } },
    },
  });
  if (!order) return false;

  // 7.2 Блок 2: призначений агент бачить замовлення (сайтові — без code1C).
  if (order.assignedAgentUserId && order.assignedAgentUserId === user.id) {
    return true;
  }

  if (!order.customer?.code1C) return false;
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes === null) return true;
  return myCodes.includes(order.customer.code1C);
}
