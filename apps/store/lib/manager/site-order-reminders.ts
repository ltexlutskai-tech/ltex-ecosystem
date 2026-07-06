import { prisma } from "@ltex/db";

/**
 * Нагадування «обробити сайтове замовлення» (← 7.2 Блок 1).
 *
 * Коли клієнт оформлює замовлення з кошика сайту, воно заходить у систему як
 * чернетка (`Order.status = "draft"`, `Order.source = "site"`). Щоб менеджер
 * не пропустив його, створюємо нагадування:
 *
 *   - якщо замовлення змаршрутизоване на конкретного агента
 *     (`assignedAgentUserId`) — нагадування йому;
 *   - якщо агента не визначено (новий клієнт без області / область без
 *     менеджера у мапі `MgrRegionAgent`) — нагадування ВСІМ активним
 *     admin/owner (fallback-приймальники, як з поступленнями).
 *
 * Нагадування лінкується на замовлення (`MgrReminder.orderId`) → deep-link у
 * дзвіночку + авто-завершення при проведенні/скасуванні замовлення.
 *
 * Fire-and-forget: ніколи не кидає назовні (не блокує відповідь клієнту).
 */
export async function createSiteOrderReminders(opts: {
  orderId: string;
  orderLabel: string;
  customerName: string;
  assignedAgentUserId: string | null;
}): Promise<void> {
  try {
    let ownerIds: string[];
    if (opts.assignedAgentUserId) {
      ownerIds = [opts.assignedAgentUserId];
    } else {
      const reviewers = await prisma.user.findMany({
        where: { isActive: true, role: { in: ["admin", "owner"] } },
        select: { id: true },
      });
      ownerIds = reviewers.map((r) => r.id);
    }
    if (ownerIds.length === 0) return;

    const body = `Обробити сайтове замовлення ${opts.orderLabel} (клієнт: ${opts.customerName})`;
    const now = new Date();
    await prisma.mgrReminder.createMany({
      data: ownerIds.map((ownerUserId) => ({
        ownerUserId,
        body,
        remindAt: now,
        source: "auto_site_order" as const,
        orderId: opts.orderId,
      })),
    });
  } catch {
    // best-effort — сайтове замовлення вже створене, нагадування вторинне
  }
}

/**
 * Помітити pending-нагадування сайтового замовлення як виконані.
 * Викликається коли менеджер провів (posted) або скасував (cancelled)
 * замовлення — далі нагадувати немає сенсу.
 */
export async function completeSiteOrderReminders(
  orderId: string,
): Promise<void> {
  try {
    await prisma.mgrReminder.updateMany({
      where: { orderId, completedAt: null },
      data: { completedAt: new Date() },
    });
  } catch {
    // best-effort
  }
}
