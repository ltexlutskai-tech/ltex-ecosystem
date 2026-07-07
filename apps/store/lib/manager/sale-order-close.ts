import { prisma } from "@ltex/db";
import { formatOrderNumber, formatDocNumber } from "@/lib/manager/order-number";

/**
 * Нагадування «реалізація закрила замовлення» (7.3, рішення user).
 *
 * Коли по клієнту ПРОВОДИТЬСЯ реалізація (Sale → posted) і в цього клієнта є
 * активне замовлення (`isActual=true, archived=false, closedAt=null`) —
 * товар не важливий — менеджеру (власнику замовлення) створюється нагадування:
 * реалізація могла закрити замовлення, треба вирішити чи продовжити позиції,
 * чи закрити замовлення.
 *
 * Нагадування лінкується на замовлення (`orderId`) → deep-link + авто-завершення
 * при проведенні/скасуванні/закритті замовлення (той самий механізм, що й
 * сайтові нагадування). Дедуп: якщо на замовленні вже висить незавершене
 * нагадування цього джерела — не дублюємо.
 *
 * Fire-and-forget: НІКОЛИ не кидає (реалізація вже проведена).
 */
export async function notifyOrdersClosedBySale(opts: {
  saleId: string;
  saleNumber1C: string | null;
  saleCode1C: string | null;
  saleDocNumber: number | null;
  customerId: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const orders = await prisma.order.findMany({
      where: {
        customerId: opts.customerId,
        isActual: true,
        archived: false,
        closedAt: null,
      },
      select: {
        id: true,
        code1C: true,
        number1C: true,
        assignedAgentUserId: true,
        customer: { select: { name: true } },
      },
    });
    if (orders.length === 0) return;

    // Дедуп: замовлення, де вже є незавершене нагадування цього джерела.
    const already = await prisma.mgrReminder.findMany({
      where: {
        orderId: { in: orders.map((o) => o.id) },
        source: "auto_sale_closed_order",
        completedAt: null,
      },
      select: { orderId: true },
    });
    const skip = new Set(already.map((r) => r.orderId));

    const saleLabel = formatDocNumber({
      number1C: opts.saleNumber1C,
      code1C: opts.saleCode1C,
      docNumber: opts.saleDocNumber,
    });
    const now = new Date();
    const rows = orders
      .filter((o) => !skip.has(o.id))
      .map((o) => ({
        ownerUserId: o.assignedAgentUserId ?? opts.actorUserId,
        body:
          `Проведено реалізацію ${saleLabel} по клієнту ${o.customer.name}. ` +
          `Вона могла закрити замовлення ${formatOrderNumber(o)} — ` +
          `продовжити позиції чи закрити замовлення?`,
        remindAt: now,
        source: "auto_sale_closed_order" as const,
        orderId: o.id,
      }));
    if (rows.length === 0) return;
    await prisma.mgrReminder.createMany({ data: rows });
  } catch {
    // best-effort — реалізація вже проведена, нагадування вторинне
  }
}
