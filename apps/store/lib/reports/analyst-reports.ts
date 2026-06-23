import { prisma } from "@ltex/db";
import { resolvePeriod, type PeriodPreset } from "@/lib/finance/owner-stats";
import { buildOverdueDebtsReport } from "@/lib/reports/overdue-debts";

/**
 * Бібліотека звітів для Analyst-кабінету (← Тиждень 5 блоку Ролі).
 *
 * Реалізовано 3 базові звіти (плюсуємо за вимогами user далі):
 *   1. Продажі по клієнтах — groupBy customerId, агрегати + ранжування
 *   2. Продажі по постачальниках — JOIN SaleItem×Lot.supplierId (працює
 *      тільки для лотів з нашого Поступлення — legacy lots без supplier
 *      відображаються у «—»)
 *   3. Прострочені борги — клієнти з MgrClient.debt > 0
 *
 * Усі звіти повертають shape:
 *   { headers: string[], rows: (string|number|Date)[][] }
 * — це дозволяє рендерити у HTML-таблицю і одразу експортувати у CSV
 * через один helper `buildCsv` без дублювання логіки.
 */

export interface ReportShape {
  title: string;
  period: { from: Date; to: Date; label: string };
  headers: string[];
  rows: (string | number | Date | null)[][];
}

// ─── Звіт 1: Продажі по клієнтах ───────────────────────────────────────────
export async function reportSalesByClient(
  preset: PeriodPreset = "month",
): Promise<ReportShape> {
  const period = resolvePeriod(preset);
  const agg = await prisma.sale.groupBy({
    by: ["customerId"],
    where: {
      status: "posted",
      createdAt: { gte: period.from, lte: period.to },
    },
    _sum: { totalEur: true, totalUah: true },
    _count: { _all: true },
    orderBy: { _sum: { totalEur: "desc" } },
  });
  const ids = agg.map((a) => a.customerId);
  const customers =
    ids.length > 0
      ? await prisma.customer.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, phone: true },
        })
      : [];
  const byId = new Map(customers.map((c) => [c.id, c]));

  return {
    title: "Продажі по клієнтах",
    period,
    headers: ["#", "Клієнт", "Телефон", "Реалізацій", "Виручка €", "Виручка ₴"],
    rows: agg.map((a, idx) => {
      const c = byId.get(a.customerId);
      return [
        idx + 1,
        c?.name ?? "—",
        c?.phone ?? "",
        a._count._all,
        round2(a._sum.totalEur ?? 0),
        round2(a._sum.totalUah ?? 0),
      ];
    }),
  };
}

// ─── Звіт 2: Продажі по постачальниках (через лоти) ────────────────────────
export async function reportSalesBySupplier(
  preset: PeriodPreset = "month",
): Promise<ReportShape> {
  const period = resolvePeriod(preset);
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: "posted",
        createdAt: { gte: period.from, lte: period.to },
      },
    },
    select: {
      priceEur: true,
      weight: true,
      quantity: true,
      lot: {
        select: {
          purchasePriceEur: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  });
  // Агрегація вручну за supplierId
  type Row = {
    name: string;
    revenueEur: number;
    costEur: number;
    weight: number;
    salesCount: number;
  };
  const map = new Map<string, Row>();
  for (const it of items) {
    const supplier = it.lot?.supplier ?? null;
    const key = supplier?.id ?? "_none";
    const cur = map.get(key) ?? {
      name: supplier?.name ?? "Не призначено (legacy)",
      revenueEur: 0,
      costEur: 0,
      weight: 0,
      salesCount: 0,
    };
    cur.revenueEur += it.priceEur;
    cur.costEur += (it.lot?.purchasePriceEur ?? 0) * it.weight;
    cur.weight += it.weight;
    cur.salesCount += 1;
    map.set(key, cur);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.revenueEur - a.revenueEur)
    .map((r, idx) => [
      idx + 1,
      r.name,
      r.salesCount,
      round2(r.weight),
      round2(r.revenueEur),
      round2(r.costEur),
      round2(r.revenueEur - r.costEur),
    ]);
  return {
    title: "Продажі по постачальниках",
    period,
    headers: [
      "#",
      "Постачальник",
      "Рядків продажу",
      "Вага кг",
      "Виручка €",
      "Собівартість €",
      "Маржа €",
    ],
    rows,
  };
}

// ─── Звіт 3: Прострочені борги по договорам (FIFO-старіння) ─────────────────
export async function reportDebts(thresholdDays = 14): Promise<ReportShape> {
  const report = await buildOverdueDebtsReport(thresholdDays);
  return {
    title: "Прострочені борги по договорам",
    period: {
      from: new Date(0),
      to: new Date(),
      label: "На поточний момент",
    },
    headers: [
      "#",
      "Контрагент",
      "Борг €",
      "Прострочений борг €",
      "Борг по наложці €",
      "Днів",
      "Діяльність",
      "Торговий агент",
    ],
    rows: report.rows.map((r, idx) => [
      idx + 1,
      r.name,
      round2(r.debtEur),
      round2(r.overdueEur),
      round2(r.codDebtEur),
      r.oldestOverdueDays,
      r.activity,
      r.agentName ?? "",
    ]),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
