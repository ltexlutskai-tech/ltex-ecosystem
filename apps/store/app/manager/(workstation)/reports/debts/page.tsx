import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { reportDebts } from "@/lib/reports/analyst-reports";
import { ReportView } from "../_components/report-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Прострочені борги | L-TEX" };

export default async function Page() {
  const user = await requireRole([
    "analyst",
    "admin",
    "owner",
    "supervisor",
    "bookkeeper",
  ]);
  if (!user) notFound();
  const report = await reportDebts();
  return (
    <div className="mx-auto max-w-6xl">
      <ReportView report={report} reportId="debts" showPeriodSelector={false} />
    </div>
  );
}
