import { prisma } from "@ltex/db";

/**
 * Нагадування admin/owner про перевірку поступлення (← правки 2026-06-05).
 *
 * Workflow:
 *   1. Warehouse працівник зберігає чернетку (роль `warehouse`).
 *   2. Створюються MgrReminder для ВСІХ активних admin/owner з body
 *      «Перевірити поступлення LT-RCV-...».
 *   3. Admin/owner бачить нагадування у дзвіночку (як інші нагадування).
 *   4. При проведенні документа (status → posted) — усі нагадування
 *      позначаються completedAt = now.
 *   5. Аналогічно при скасуванні (status → cancelled).
 *
 * Якщо документ створює сам admin/owner — нагадування НЕ створюються
 * (немає сенсу нагадувати самому собі).
 */

export async function createReceivingReviewReminders(opts: {
  receivingId: string;
  docNumber: string;
  createdByUserId: string;
  createdByUserRole: string;
  createdByUserName: string;
}): Promise<void> {
  // Не створюємо нагадування коли документ створив сам admin/owner
  if (
    opts.createdByUserRole === "admin" ||
    opts.createdByUserRole === "owner"
  ) {
    return;
  }
  const reviewers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["admin", "owner"] },
    },
    select: { id: true },
  });
  if (reviewers.length === 0) return;

  const body = `Перевірити поступлення ${opts.docNumber} (склад: ${opts.createdByUserName})`;
  const now = new Date();
  await prisma.mgrReminder.createMany({
    data: reviewers.map((r) => ({
      ownerUserId: r.id,
      body,
      remindAt: now,
      source: "auto_receiving_review" as const,
      receivingId: opts.receivingId,
    })),
  });
}

/**
 * Помітити усі pending нагадування для документа як виконані.
 * Викликається при проведенні або скасуванні.
 */
export async function completeReceivingReviewReminders(
  receivingId: string,
): Promise<void> {
  await prisma.mgrReminder.updateMany({
    where: {
      receivingId,
      completedAt: null,
    },
    data: { completedAt: new Date() },
  });
}
