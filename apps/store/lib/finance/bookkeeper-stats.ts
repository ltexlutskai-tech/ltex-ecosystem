import { prisma } from "@ltex/db";
import { resolvePeriod, type PeriodPreset } from "./owner-stats";

/**
 * Фінансова статистика для Bookkeeper-кабінету (← Тиждень 4 блоку Ролі).
 *
 * Орієнтована на касу і взаєморозрахунки:
 *   - Сума приходних КО (надходження готівки) за період
 *   - Сума розходних КО (видача готівки) за період
 *   - Сальдо (приходи − витрати)
 *   - Сумарний борг клієнтів (€)
 *   - Останні 20 несплачених реалізацій (зі статусом posted і totalEur > 0)
 *
 * Аналог 1С звітів «Касова книга», «Прострочені борги».
 */

export interface BookkeeperStats {
  period: { from: Date; to: Date; label: string };
  cashInEur: number;
  cashOutEur: number;
  cashBalanceEur: number;
  cashOrdersCount: number;
  totalDebtEur: number;
  // Топ-10 клієнтів за боргом
  topDebtors: {
    id: string;
    name: string;
    debt: number;
  }[];
  // Останні 20 проведених реалізацій (для перевірки оплат)
  recentSales: {
    id: string;
    docNumber: number;
    customerName: string;
    totalEur: number;
    createdAt: Date;
  }[];
  // Поточні курси
  rates: {
    eur: number | null;
    usd: number | null;
    updatedAt: Date | null;
  };
}

export async function getBookkeeperStats(
  preset: PeriodPreset = "month",
): Promise<BookkeeperStats> {
  const period = resolvePeriod(preset);

  const [cashIn, cashOut, debtAgg, topDebtorsRaw, recentSales, rates] =
    await Promise.all([
      prisma.mgrCashOrder.aggregate({
        where: {
          type: "income",
          status: "posted",
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { documentSumEur: true },
        _count: { _all: true },
      }),
      prisma.mgrCashOrder.aggregate({
        where: {
          type: "expense",
          status: "posted",
          createdAt: { gte: period.from, lte: period.to },
        },
        _sum: { documentSumEur: true },
        _count: { _all: true },
      }),
      prisma.mgrClient.aggregate({
        _sum: { debt: true },
      }),
      prisma.mgrClient.findMany({
        where: { debt: { gt: 0 } },
        orderBy: { debt: "desc" },
        take: 10,
        select: { id: true, name: true, debt: true },
      }),
      prisma.sale.findMany({
        where: { status: "posted" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          docNumber: true,
          totalEur: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.exchangeRate.findMany({
        where: { currencyTo: "UAH", currencyFrom: { in: ["EUR", "USD"] } },
        orderBy: { date: "desc" },
        distinct: ["currencyFrom"],
        take: 2,
      }),
    ]);

  const cashInEur = cashIn._sum.documentSumEur
    ? Number(cashIn._sum.documentSumEur)
    : 0;
  const cashOutEur = cashOut._sum.documentSumEur
    ? Number(cashOut._sum.documentSumEur)
    : 0;

  return {
    period,
    cashInEur: round2(cashInEur),
    cashOutEur: round2(cashOutEur),
    cashBalanceEur: round2(cashInEur - cashOutEur),
    cashOrdersCount: cashIn._count._all + cashOut._count._all,
    totalDebtEur: round2(debtAgg._sum.debt ? Number(debtAgg._sum.debt) : 0),
    topDebtors: topDebtorsRaw.map((d) => ({
      id: d.id,
      name: d.name,
      debt: round2(Number(d.debt)),
    })),
    recentSales: recentSales.map((s) => ({
      id: s.id,
      docNumber: s.docNumber,
      customerName: s.customer?.name ?? "—",
      totalEur: round2(s.totalEur),
      createdAt: s.createdAt,
    })),
    rates: {
      eur: rates.find((r) => r.currencyFrom === "EUR")?.rate ?? null,
      usd: rates.find((r) => r.currencyFrom === "USD")?.rate ?? null,
      updatedAt:
        rates.length > 0
          ? (rates.reduce<Date | null>(
              (max, r) =>
                max === null || r.date.getTime() > max.getTime() ? r.date : max,
              null,
            ) ?? null)
          : null,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
