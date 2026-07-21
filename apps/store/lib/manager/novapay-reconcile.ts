import { prisma } from "@ltex/db";
import { trackTtnMany } from "@/lib/delivery/nova-poshta";
import { isDeliveredStatus } from "@/lib/delivery/np-status";
import { createPaymentOrders } from "@/lib/manager/cash-order";
import { formatDocNumber } from "@/lib/manager/order-number";

/**
 * NovaPay «Контроль оплати» (Фаза 5) — авто-звірка оплат накладки.
 *
 * Для реалізацій з накладкою через Нову Пошту (`cashOnDelivery` + `ttnRef`),
 * коли посилку ОТРИМАНО (клієнт оплатив на відділенні, гроші йдуть на рахунок
 * відправника через NovaPay), автоматично СТВОРЮЄМО Й ПРОВОДИМО прихідний
 * касовий ордер на суму накладки (борг клієнта зменшується штатно через
 * `createPaymentOrders(post=true)` → `applyDebtMovementSafe`) + сповіщаємо
 * менеджера. Ордер позначається `source="novapay_auto"` — для щоденної звірки
 * працівником офісу (сторінка «Звірка NovaPay», кнопка «Перевірено»).
 *
 * Опційний банк-рахунок NovaPay — з env `NP_NOVAPAY_BANK_ACCOUNT_ID` (щоб безнал
 * потрапляв на правильний рахунок у ДДС); якщо не задано — рахунок не проставляємо.
 *
 * Ідемпотентність: обробляємо реалізацію ЛИШЕ якщо для неї ще НЕМАЄ жодного
 * касового ордера (`cashOrders: none`). Створений ордер робить count > 0 → на
 * наступному проході реалізація вже не потрапляє в кандидати.
 */

export interface ReconcileNovaPayResult {
  checked: number;
  posted: number;
}

export async function reconcileNovaPayPayments(
  limit = 100,
): Promise<ReconcileNovaPayResult> {
  // Кандидати: НП-накладка (ttnRef — лише Нова Пошта), сума накладки > 0,
  // ще без жодного касового ордера.
  const sales = await prisma.sale.findMany({
    where: {
      cashOnDelivery: true,
      ttnRef: { not: null },
      expressWaybill: { not: null },
      codAmountUah: { gt: 0 },
      markedForDeletion: false,
      cashOrders: { none: {} },
    },
    orderBy: { ttnCreatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      expressWaybill: true,
      codAmountUah: true,
      totalEur: true,
      exchangeRateEur: true,
      exchangeRateUsd: true,
      assignedAgentUserId: true,
      number1C: true,
      code1C: true,
      docNumber: true,
      customer: { select: { name: true } },
    },
  });
  if (sales.length === 0) return { checked: 0, posted: 0 };

  const bankAccountId = process.env.NP_NOVAPAY_BANK_ACCOUNT_ID || null;

  const waybills = sales
    .map((s) => s.expressWaybill)
    .filter((w): w is string => Boolean(w));
  const statuses = await trackTtnMany(waybills);

  let posted = 0;
  for (const sale of sales) {
    const t = sale.expressWaybill
      ? statuses.get(sale.expressWaybill)
      : undefined;
    if (!t || !isDeliveredStatus(t.statusCode)) continue;

    const cod = sale.codAmountUah ?? 0;
    if (cod <= 0) continue;

    try {
      // Створюємо Й ПРОВОДИМО прихідний ордер (борг зменшується автоматично).
      const { income } = await createPaymentOrders({
        saleId: sale.id,
        type: "income",
        // Накладка NovaPay приходить безготівкою на рахунок відправника.
        paid: { uah: 0, eur: 0, usd: 0, uahCashless: cod },
        change: { uah: 0, eur: 0, usd: 0 },
        post: true,
        bankAccountId,
        rates: { eur: sale.exchangeRateEur, usd: sale.exchangeRateUsd },
        sumToPayEur: sale.totalEur,
        comment: "Автоматично: оплата накладки NovaPay",
        agentUserId: sale.assignedAgentUserId,
      });
      // Позначаємо джерело — для щоденної звірки працівником офісу.
      await prisma.mgrCashOrder
        .update({ where: { id: income.id }, data: { source: "novapay_auto" } })
        .catch(() => undefined);
      posted++;

      // Сповіщення менеджеру (best-effort).
      if (sale.assignedAgentUserId) {
        const num = formatDocNumber(sale);
        await prisma.mgrReminder
          .create({
            data: {
              ownerUserId: sale.assignedAgentUserId,
              body: `Клієнт оплатив накладку по реалізації ${num} (${sale.customer.name}) — ${Math.round(
                cod,
              )} грн. Оплату проведено автоматично (перевірте у «Звірка NovaPay»).`,
              remindAt: new Date(),
              source: "manual",
            },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      console.error("[L-TEX] reconcileNovaPay draft failed", {
        saleId: sale.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked: sales.length, posted };
}
