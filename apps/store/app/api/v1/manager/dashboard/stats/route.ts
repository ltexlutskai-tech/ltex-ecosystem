import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const [clientCount, debtAggregate, latestRates] = await Promise.all([
    prisma.clientAssignment.count({ where: { userId: user.id } }),
    prisma.mgrClient.aggregate({
      where: { assignments: { some: { userId: user.id } } },
      _sum: { debt: true },
    }),
    prisma.exchangeRate.findMany({
      where: {
        currencyTo: "UAH",
        currencyFrom: { in: ["EUR", "USD"] },
      },
      orderBy: { date: "desc" },
      distinct: ["currencyFrom"],
      take: 2,
    }),
  ]);

  const eur = latestRates.find((r) => r.currencyFrom === "EUR")?.rate ?? null;
  const usd = latestRates.find((r) => r.currencyFrom === "USD")?.rate ?? null;
  const totalDebt = debtAggregate._sum.debt
    ? Number(debtAggregate._sum.debt)
    : 0;

  // TODO M1.4+ — реальні counts після того як з'явиться mgr_orders / mgr_sales snapshot з 1С.
  const sessionCounts = { orders: 0, sales: 0, payments: 0, routes: 0 };
  // TODO M1.5+ — `lastSyncAt` має приходити з sync-worker state, а не з now().
  const syncStatus = { lastSyncAt: new Date().toISOString() };

  return NextResponse.json({
    clientCount,
    totalDebt,
    eur,
    usd,
    syncStatus,
    sessionCounts,
  });
}
