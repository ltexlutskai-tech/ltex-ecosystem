import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { reportSalesByClient } from "@/lib/reports/analyst-reports";
import type { PeriodPreset } from "@/lib/finance/owner-stats";
import { ReportView } from "../_components/report-view";
import { ReportsNav } from "../_components/reports-nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Продажі по клієнтах | L-TEX" };

const VALID: PeriodPreset[] = ["today", "week", "month", "year", "all"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireRole(["analyst", "admin", "owner", "supervisor"]);
  if (!user) notFound();
  const sp = await searchParams;
  const preset: PeriodPreset = VALID.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "month";
  const report = await reportSalesByClient(preset);
  return (
    <div className="mx-auto max-w-6xl">
      <ReportsNav />
      <ReportView
        report={report}
        reportId="sales-by-client"
        currentPreset={preset}
      />
    </div>
  );
}
