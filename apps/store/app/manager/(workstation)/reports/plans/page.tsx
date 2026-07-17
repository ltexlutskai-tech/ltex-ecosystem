import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { UA_REGIONS } from "@/lib/constants/regions";
import { normalizeMonth, TOTAL_PLAN_SLUG } from "@/lib/reports/manager-summary";
import { PlansEditor, type PlanRowInput } from "./_components/plans-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "План продажів | L-TEX" };

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function SalesPlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // План задають адмін/власник/аналітик (ТЗ 2026-07-17).
  const user = await requireRole(["admin", "owner", "analyst"]);
  if (!user) notFound();

  const sp = await searchParams;
  const monthParam = typeof sp.month === "string" ? sp.month : undefined;
  const month = normalizeMonth(monthParam) ?? currentMonth();

  const existing = await prisma.salesPlan.findMany({ where: { month } });
  const bySlug = new Map(existing.map((p) => [p.regionSlug, p]));

  const totalRow: PlanRowInput = {
    regionSlug: TOTAL_PLAN_SLUG,
    label: "Загальний план",
    planRevenueUah: bySlug.get(TOTAL_PLAN_SLUG)?.planRevenueUah ?? 0,
    planTtCount: bySlug.get(TOTAL_PLAN_SLUG)?.planTtCount ?? 0,
    planNewTtCount: bySlug.get(TOTAL_PLAN_SLUG)?.planNewTtCount ?? 0,
  };
  const regionRows: PlanRowInput[] = UA_REGIONS.map((r) => ({
    regionSlug: r.slug,
    label: r.label,
    planRevenueUah: bySlug.get(r.slug)?.planRevenueUah ?? 0,
    planTtCount: bySlug.get(r.slug)?.planTtCount ?? 0,
    planNewTtCount: bySlug.get(r.slug)?.planNewTtCount ?? 0,
  }));

  return (
    <div className="max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-800">План продажів</h1>
        <p className="mt-1 text-sm text-gray-600">
          Задайте план по областях на місяць: виручку (₴), кількість ТТ, що
          скупились, та кількість нових ТТ. Порівнюється з фактом у «Звіті
          менеджера».
        </p>
      </header>
      <PlansEditor month={month} totalRow={totalRow} regionRows={regionRows} />
    </div>
  );
}
