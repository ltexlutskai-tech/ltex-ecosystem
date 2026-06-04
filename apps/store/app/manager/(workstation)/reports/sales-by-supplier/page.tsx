import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { reportSalesBySupplier } from "@/lib/reports/analyst-reports";
import type { PeriodPreset } from "@/lib/finance/owner-stats";
import { ReportView } from "../_components/report-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Продажі по постачальниках | L-TEX" };

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
  const report = await reportSalesBySupplier(preset);
  return (
    <div className="mx-auto max-w-6xl">
      <ReportView
        report={report}
        reportId="sales-by-supplier"
        currentPreset={preset}
      />
    </div>
  );
}
