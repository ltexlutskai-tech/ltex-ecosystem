import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  reportMargin,
  MARGIN_GROUPS,
  type MarginGroupBy,
} from "@/lib/reports/margin-report";
import type { PeriodPreset } from "@/lib/finance/owner-stats";
import { ReportView } from "../_components/report-view";
import { ReportsNav } from "../_components/reports-nav";
import { MarginGroupNav } from "./_components/margin-group-nav";
import { MarginPeriodNav } from "./_components/margin-period-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Маржа / Валовий прибуток | L-TEX" };

const VALID_PERIODS: PeriodPreset[] = ["today", "week", "month", "year", "all"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; period?: string }>;
}) {
  const user = await requireRole([
    "analyst",
    "admin",
    "owner",
    "supervisor",
    "bookkeeper",
  ]);
  if (!user) notFound();

  const sp = await searchParams;
  const group: MarginGroupBy = MARGIN_GROUPS.includes(sp.group as MarginGroupBy)
    ? (sp.group as MarginGroupBy)
    : "product";
  const period: PeriodPreset = VALID_PERIODS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "month";

  const report = await reportMargin(group, period);

  return (
    <div className="mx-auto max-w-6xl">
      <ReportsNav />
      <div className="mb-4 space-y-3">
        <MarginGroupNav current={group} period={period} />
        <MarginPeriodNav current={period} group={group} />
      </div>
      <ReportView
        report={report}
        reportId="margin"
        currentPreset={period}
        showPeriodSelector={false}
        csvExtraParams={{ group }}
      />
    </div>
  );
}
