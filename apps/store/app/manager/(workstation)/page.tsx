import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { DashboardCurrencyRow } from "./_components/dashboard-currency-row";
import { DashboardGreeting } from "./_components/dashboard-greeting";
import { DashboardStatsRow } from "./_components/dashboard-stats-row";
import { DashboardTiles } from "./_components/dashboard-tiles";

export const dynamic = "force-dynamic";

async function getDashboardData(userId: string) {
  const [clientCount, debtAggregate, latestRates, routeSheetCount] =
    await Promise.all([
      prisma.clientAssignment.count({ where: { userId } }),
      prisma.mgrClient.aggregate({
        where: { assignments: { some: { userId } } },
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
      // Активні маршрутні листи — спільний диспетчерський документ (без скоупу).
      prisma.routeSheet.count({ where: { archived: false } }),
    ]);
  const eur = latestRates.find((r) => r.currencyFrom === "EUR")?.rate ?? null;
  const usd = latestRates.find((r) => r.currencyFrom === "USD")?.rate ?? null;
  const totalDebt = debtAggregate._sum.debt
    ? Number(debtAggregate._sum.debt)
    : 0;
  return {
    clientCount,
    totalDebt,
    eur,
    usd,
    tileCounts: {
      orders: 0,
      sales: 0,
      payments: 0,
      routes: 0,
      routeSheets: routeSheetCount,
    },
  };
}

export default async function WorkstationDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  const data = await getDashboardData(user.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DashboardGreeting fullName={user.fullName} />
      <DashboardStatsRow
        clientCount={data.clientCount}
        totalDebt={data.totalDebt}
      />
      <DashboardCurrencyRow
        eur={data.eur}
        usd={data.usd}
        canEdit={user.role === "admin"}
      />
      <DashboardTiles counts={data.tileCounts} />
    </div>
  );
}
