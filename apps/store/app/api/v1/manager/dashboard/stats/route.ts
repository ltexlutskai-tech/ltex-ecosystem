import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const [clientCount, debtAggregate, latestRates, myCodes] = await Promise.all([
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
    getMyClientCodes1C(user),
  ]);

  const eur = latestRates.find((r) => r.currencyFrom === "EUR")?.rate ?? null;
  const usd = latestRates.find((r) => r.currencyFrom === "USD")?.rate ?? null;
  const totalDebt = debtAggregate._sum.debt
    ? Number(debtAggregate._sum.debt)
    : 0;

  let ordersToday = 0;
  let salesActive = 0;
  if (myCodes === null || myCodes.length > 0) {
    const scopeWhere =
      myCodes !== null ? { customer: { code1C: { in: myCodes } } } : {};
    const ordersWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: startOfTodayUtc() },
      ...scopeWhere,
    };
    // Реалізації: активні (не архівні/проведені) у скоупі менеджера.
    const salesWhere: Prisma.SaleWhereInput = {
      archived: false,
      ...scopeWhere,
    };
    [ordersToday, salesActive] = await Promise.all([
      prisma.order.count({ where: ordersWhere }),
      prisma.sale.count({ where: salesWhere }),
    ]);
  }

  // TODO M1.5+ — payments/routes після SOAP snapshot
  const sessionCounts = {
    orders: ordersToday,
    sales: salesActive,
    payments: 0,
    routes: 0,
  };
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
