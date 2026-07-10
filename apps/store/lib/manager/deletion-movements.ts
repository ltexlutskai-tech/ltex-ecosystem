import { prisma } from "@ltex/db";
import {
  applyDebtMovementSafe,
  recomputeDebtForClients,
} from "@/lib/manager/debt-register";
import {
  applySaleMovements,
  removeSaleMovements,
} from "@/lib/manager/sale-movement-hooks";
import {
  applyCashFlowMovementsSafe,
  deleteCashFlowMovementsForOrder,
  type CashFlowOrderRow,
} from "@/lib/manager/cashflow-register";
import {
  applyCompleteTransitSafe,
  applyDispatchTransitSafe,
} from "@/lib/manager/route-sheet-transit";
import type { DeletableEntityType } from "@/lib/manager/reference-check";

/**
 * Реверс / відновлення рухів по регістрах для «позначки на вилучення».
 *
 * Рішення user: рухи по регістрах (борг/ДДС/продажі/склад/транзит) відкочуються
 * ОДРАЗУ при постановці документа на вилучення (щоб клієнт/менеджер бачили
 * актуальну інформацію негайно, не чекаючи адміна), а «кошик» дозволяє повернути
 * документ (і рухи) поки адмін не відправив у архів / не видалив остаточно.
 *
 * `reverseDocMovements` викликається при mark; `reapplyDocMovements` — при
 * поверненні (менеджером із кошика або адміном через «Відхилити»).
 *
 * Живі рухи мають лише 4 типи (order боргу не пише): sale, cash_order,
 * route_sheet. Для client/order/dictionary/category/product — no-op.
 *
 * Дзеркалить наявні прямі DELETE-роути (sales/[id], cash-orders/[id]), але БЕЗ
 * видалення самого документа — він лишається, лише позначений.
 */

/** Форма касового ордера для (пере)запису рухів ДДС + реверсу боргу. */
const CASH_ORDER_SELECT = {
  id: true,
  type: true,
  amountUah: true,
  amountEur: true,
  amountUsd: true,
  amountUahCashless: true,
  rateEur: true,
  rateUsd: true,
  bankAccountId: true,
  cashFlowArticleId: true,
  customerId: true,
  saleId: true,
  documentSumEur: true,
  paidAt: true,
  createdAt: true,
} as const;

type CashOrderRecord = {
  id: string;
  type: string;
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  amountUahCashless: number;
  rateEur: number;
  rateUsd: number;
  bankAccountId: string | null;
  cashFlowArticleId: string | null;
  customerId: string | null;
  saleId: string | null;
  documentSumEur: number;
  paidAt: Date;
  createdAt: Date;
};

function toCashFlowRow(o: CashOrderRecord): CashFlowOrderRow {
  return {
    id: o.id,
    type: o.type,
    amountUah: o.amountUah,
    amountEur: o.amountEur,
    amountUsd: o.amountUsd,
    amountUahCashless: o.amountUahCashless,
    rateEur: o.rateEur,
    rateUsd: o.rateUsd,
    bankAccountId: o.bankAccountId,
    cashFlowArticleId: o.cashFlowArticleId,
    customerId: o.customerId,
    saleId: o.saleId,
    occurredAt: o.paidAt ?? o.createdAt,
  };
}

/**
 * Відкочує живі рухи документа (борг + продажі/склад/собівартість + ДДС + транзит)
 * і перераховує кеш боргу. Документ НЕ видаляється. Await-иться у mark-потоці,
 * щоб борг оновився до відповіді.
 */
export async function reverseDocMovements(
  entityType: DeletableEntityType,
  entityId: string,
): Promise<void> {
  switch (entityType) {
    case "sale": {
      const sale = await prisma.sale.findUnique({
        where: { id: entityId },
        select: { id: true, code1C: true },
      });
      if (!sale) return;
      const recorder = sale.code1C ?? sale.id;
      const moves = await prisma.mgrDebtMovement.findMany({
        where: { sourceType: "sale", sourceId: entityId },
        select: { clientId: true },
      });
      const clientIds = [...new Set(moves.map((m) => m.clientId))];
      await prisma.mgrDebtMovement.deleteMany({
        where: { sourceType: "sale", sourceId: entityId },
      });
      removeSaleMovements(recorder); // рухи продажів/складу/собівартості
      if (clientIds.length > 0) {
        await recomputeDebtForClients(prisma, clientIds);
      }
      return;
    }

    case "cash_order": {
      const moves = await prisma.mgrDebtMovement.findMany({
        where: { sourceType: "cash_order", sourceId: entityId },
        select: { clientId: true },
      });
      const clientIds = [...new Set(moves.map((m) => m.clientId))];
      const changeOrders = await prisma.mgrCashOrder.findMany({
        where: { changeForId: entityId },
        select: { id: true },
      });
      await prisma.mgrDebtMovement.deleteMany({
        where: { sourceType: "cash_order", sourceId: entityId },
      });
      await deleteCashFlowMovementsForOrder(prisma, [
        entityId,
        ...changeOrders.map((o) => o.id),
      ]);
      if (clientIds.length > 0) {
        await recomputeDebtForClients(prisma, clientIds);
      }
      return;
    }

    case "route_sheet": {
      // Транзит — аналітичний регістр; борг/касу маршрут не пише.
      await prisma.transitMovement.deleteMany({
        where: { recorderCode1C: entityId },
      });
      return;
    }

    default:
      // order / client / dictionary / category / product — живих рухів немає.
      return;
  }
}

/**
 * Відновлює живі рухи документа (при поверненні з кошика / відхиленні адміном).
 * Документ уже існує (лише був позначений) — перезапускаємо хуки проведення.
 */
export async function reapplyDocMovements(
  entityType: DeletableEntityType,
  entityId: string,
): Promise<void> {
  switch (entityType) {
    case "sale": {
      const sale = await prisma.sale.findUnique({
        where: { id: entityId },
        select: {
          id: true,
          status: true,
          archived: true,
          customerId: true,
          totalEur: true,
          createdAt: true,
        },
      });
      if (!sale) return;
      // Рухи продажів/складу/собівартості — ідемпотентний перезапис.
      applySaleMovements(sale.id);
      // Борг несе лише проведена реалізація (posted → archived).
      const posted = sale.status === "posted" || sale.archived;
      if (posted) {
        applyDebtMovementSafe({
          customerId: sale.customerId,
          amountEur: Number(sale.totalEur),
          kind: "sale",
          sourceType: "sale",
          sourceId: sale.id,
          occurredAt: sale.createdAt ?? new Date(),
          note: "Реалізація відновлена з кошика",
        });
      }
      return;
    }

    case "cash_order": {
      const income = await prisma.mgrCashOrder.findUnique({
        where: { id: entityId },
        select: CASH_ORDER_SELECT,
      });
      if (!income) return;
      const changeOrders = await prisma.mgrCashOrder.findMany({
        where: { changeForId: entityId },
        select: CASH_ORDER_SELECT,
      });

      // Рухи ДДС — головного ордера + парних здач (ідемпотентно).
      applyCashFlowMovementsSafe(toCashFlowRow(income));
      for (const co of changeOrders) {
        applyCashFlowMovementsSafe(toCashFlowRow(co));
      }

      // Борг: погашення зменшує борг на settledEur = сума оплати − сума здачі
      // (documentSumEur головного ордера мінус documentSumEur здач). Лише income.
      if (income.type === "income") {
        const changeSum = changeOrders.reduce(
          (s, c) => s + c.documentSumEur,
          0,
        );
        const settledEur =
          Math.round((income.documentSumEur - changeSum) * 100) / 100;
        const customerId =
          income.customerId ??
          (income.saleId
            ? ((
                await prisma.sale.findUnique({
                  where: { id: income.saleId },
                  select: { customerId: true },
                })
              )?.customerId ?? null)
            : null);
        if (customerId && settledEur !== 0) {
          applyDebtMovementSafe({
            customerId,
            amountEur: -settledEur,
            kind: "payment",
            sourceType: "cash_order",
            sourceId: income.id,
            occurredAt: income.paidAt ?? new Date(),
            note: "Оплата відновлена з кошика",
          });
        }
      }
      return;
    }

    case "route_sheet": {
      const rs = await prisma.routeSheet.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (!rs) return;
      if (rs.status === "dispatched" || rs.status === "completed") {
        applyDispatchTransitSafe(entityId);
      }
      if (rs.status === "completed") {
        applyCompleteTransitSafe(entityId);
      }
      return;
    }

    default:
      return;
  }
}
