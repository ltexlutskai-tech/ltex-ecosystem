import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getFinanceStats, type PeriodPreset } from "@/lib/finance/owner-stats";
import { getBookkeeperStats } from "@/lib/finance/bookkeeper-stats";
import { getSupervisorStats } from "@/lib/finance/supervisor-stats";
import { sanitizeDashboardConfig } from "@/lib/manager/dashboard-widgets";
import type { ManagerRole } from "@/lib/auth/jwt";
import { BookkeeperDashboard } from "./_components/bookkeeper-dashboard";
import { AnalystDashboard } from "./_components/analyst-dashboard";
import {
  CustomizableDashboard,
  type DashboardData,
} from "./_components/dashboard/customizable-dashboard";
import { SupervisorDashboard } from "./_components/supervisor-dashboard";
import { countOpenReminders } from "./customers/_lib/load-clients";

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

/** Розклад робочого столу користувача (санітизований по allow-list віджетів). */
async function loadDashboardConfig(userId: string, role: ManagerRole) {
  const row = await prisma.mgrUserViewPrefs
    .findUnique({
      where: { userId_viewKey: { userId, viewKey: "dashboard" } },
    })
    .catch(() => null);
  return sanitizeDashboardConfig(row?.config ?? null, role);
}

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

  // ─── Owner / admin + решта ролей: КАСТОМІЗОВАНИЙ робочий стіл ─────────────
  // Користувач сам складає панель віджетів (додати/змінити розмір/переставити).
  // Owner/admin додатково мають фінансові віджети (виручка/маржа/графік/топ).
  const financeAvailable = user.role === "owner" || user.role === "admin";
  const [base, finance, config, openReminderCount] = await Promise.all([
    getDashboardData(user.id),
    financeAvailable ? getFinanceStats(preset) : Promise.resolve(null),
    loadDashboardConfig(user.id, user.role),
    countOpenReminders(user.id, user.role),
  ]);

  const dashboardData: DashboardData = {
    fullName: user.fullName,
    role: user.role,
    clientCount: base.clientCount,
    totalDebt: base.totalDebt,
    eur: base.eur,
    usd: base.usd,
    tileCounts: base.tileCounts,
    canEditCurrency: financeAvailable,
    openReminderCount,
    finance,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <CustomizableDashboard
        data={dashboardData}
        initialWidgets={config.widgets}
        currentPeriod={preset}
      />
    </div>
  );
}
