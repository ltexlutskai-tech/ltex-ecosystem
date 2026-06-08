import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getFinanceStats, type PeriodPreset } from "@/lib/finance/owner-stats";
import { getBookkeeperStats } from "@/lib/finance/bookkeeper-stats";
import { getSupervisorStats } from "@/lib/finance/supervisor-stats";
import { BookkeeperDashboard } from "./_components/bookkeeper-dashboard";
import { AnalystDashboard } from "./_components/analyst-dashboard";
import { DashboardCurrencyRow } from "./_components/dashboard-currency-row";
import { DashboardGreeting } from "./_components/dashboard-greeting";
import { DashboardStatsRow } from "./_components/dashboard-stats-row";
import { DashboardTiles } from "./_components/dashboard-tiles";
import { OwnerDashboard } from "./_components/owner-dashboard";
import { SupervisorDashboard } from "./_components/supervisor-dashboard";

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
      routeSheets: routeSheetCount,
    },
  };
}

const VALID_PERIODS: PeriodPreset[] = ["today", "week", "month", "year", "all"];

export default async function WorkstationDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  // Період для всіх role-specific дашбордів
  const sp = await searchParams;
  const preset: PeriodPreset = VALID_PERIODS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "month";

  // ─── Owner / admin: фінансовий дашборд (← Тиждень 3 блоку Ролі) ───────────
  if (user.role === "owner" || user.role === "admin") {
    const stats = await getFinanceStats(preset);
    return (
      <div className="mx-auto max-w-6xl">
        <OwnerDashboard
          fullName={user.fullName}
          stats={stats}
          currentPreset={preset}
        />
      </div>
    );
  }

  // ─── Bookkeeper: каса / борги / курси (← Тиждень 4) ──────────────────────
  if (user.role === "bookkeeper") {
    const stats = await getBookkeeperStats(preset);
    return (
      <div className="mx-auto max-w-6xl">
        <BookkeeperDashboard
          fullName={user.fullName}
          stats={stats}
          currentPreset={preset}
        />
      </div>
    );
  }

  // ─── Supervisor: рейтинг менеджерів (← Тиждень 4) ────────────────────────
  if (user.role === "supervisor") {
    const stats = await getSupervisorStats(preset);
    return (
      <div className="mx-auto max-w-6xl">
        <SupervisorDashboard
          fullName={user.fullName}
          stats={stats}
          currentPreset={preset}
        />
      </div>
    );
  }

  // ─── Analyst: аналітичний дашборд зі звітами (← Тиждень 5) ───────────────
  if (user.role === "analyst") {
    const stats = await getFinanceStats(preset);
    return (
      <div className="mx-auto max-w-6xl">
        <AnalystDashboard
          fullName={user.fullName}
          stats={stats}
          currentPreset={preset}
        />
      </div>
    );
  }

  // ─── Інші ролі: стандартний дашборд менеджера ─────────────────────────────
  const data = await getDashboardData(user.id);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DashboardGreeting fullName={user.fullName} />
      <DashboardStatsRow
        clientCount={data.clientCount}
        totalDebt={data.totalDebt}
      />
      <DashboardCurrencyRow eur={data.eur} usd={data.usd} canEdit={false} />
      <DashboardTiles counts={data.tileCounts} />
    </div>
  );
}
