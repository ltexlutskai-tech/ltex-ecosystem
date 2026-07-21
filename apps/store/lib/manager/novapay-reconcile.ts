import { prisma } from "@ltex/db";
import { trackTtnMany } from "@/lib/delivery/nova-poshta";
import { isDeliveredStatus } from "@/lib/delivery/np-status";
import { createCashOrderDraft } from "@/lib/manager/cash-order";
import { formatDocNumber } from "@/lib/manager/order-number";

/**
 * NovaPay «Контроль оплати» (Фаза 5) — авто-звірка оплат накладки.
 *
 * Для реалізацій з накладкою через Нову Пошту (`cashOnDelivery` + `ttnRef`),
 * коли посилку ОТРИМАНО (клієнт оплатив на відділенні, гроші йдуть на рахунок
 * відправника через NovaPay), автоматично готуємо ЧЕРНЕТКУ прихідного касового
 * ордера на суму накладки + сповіщаємо менеджера.
 *
 * Свідомо НЕ проводимо автоматично: менеджер перевіряє суму й натискає
 * «Провести» у Касі (наявний банер «Є непроведені оплати»), після чого борг
 * клієнта зменшується штатно (`postCashOrder` → `applyDebtMovementSafe`).
 *
 * Ідемпотентність: створюємо чернетку ЛИШЕ якщо для реалізації ще НЕМАЄ жодного
 * касового ордера (`cashOrders: none`). Створена чернетка робить count > 0 → на
 * наступному проході реалізація вже не потрапляє в кандидати.
 */

export interface ReconcileNovaPayResult {
  checked: number;
  drafted: number;
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
      exchangeRateEur: true,
      exchangeRateUsd: true,
      assignedAgentUserId: true,
      number1C: true,
      code1C: true,
      docNumber: true,
      customer: { select: { name: true } },
    },
  });
  if (sales.length === 0) return { checked: 0, drafted: 0 };

  const waybills = sales
    .map((s) => s.expressWaybill)
    .filter((w): w is string => Boolean(w));
  const statuses = await trackTtnMany(waybills);

  let drafted = 0;
  for (const sale of sales) {
    const t = sale.expressWaybill
      ? statuses.get(sale.expressWaybill)
      : undefined;
    if (!t || !isDeliveredStatus(t.statusCode)) continue;

    const cod = sale.codAmountUah ?? 0;
    if (cod <= 0) continue;

    try {
      await createCashOrderDraft({
        saleId: sale.id,
        type: "income",
        // Накладка NovaPay приходить безготівкою на рахунок відправника.
        paid: { uah: 0, eur: 0, usd: 0, uahCashless: cod },
        rates: { eur: sale.exchangeRateEur, usd: sale.exchangeRateUsd },
        comment:
          "Автоматично: оплата накладки NovaPay (перевірте суму й проведіть)",
        agentUserId: sale.assignedAgentUserId,
      });
      drafted++;

      // Сповіщення менеджеру (best-effort).
      if (sale.assignedAgentUserId) {
        const num = formatDocNumber(sale);
        await prisma.mgrReminder
          .create({
            data: {
              ownerUserId: sale.assignedAgentUserId,
              body: `Клієнт оплатив накладку по реалізації ${num} (${sale.customer.name}) — ${Math.round(
                cod,
              )} грн. Перевірте суму й проведіть оплату в Касі.`,
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

  return { checked: sales.length, drafted };
}
