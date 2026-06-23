import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  buildSalesFlexReport,
  DIMENSIONS,
  INDICATORS,
} from "@/lib/reports/sales-flex";
import { ReportsNav } from "../_components/reports-nav";
import { ReportExportButtons } from "../_components/report-export-buttons";
import { SalesFlexConfig } from "./_components/sales-flex-config";
import { SalesFlexTree } from "./_components/sales-flex-tree";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіт: Підсумок продажів | L-TEX" };

export default async function SalesSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  // Збираємо плоский URLSearchParams лише зі string-значень.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
  }

  const result = await buildSalesFlexReport(params);

  const dimensions = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));
  const indicators = INDICATORS.map((i) => ({ key: i.key, label: i.label }));

  const initialFilters: Record<string, string> = {};
  for (const d of DIMENSIONS) {
    const v = params.get(`f_${d.key}`);
    if (v) initialFilters[d.key] = v;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ReportsNav />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Звіт: Підсумок продажів
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Гнучкий звіт продажів з довільним групуванням, показниками та
            відборами.{" "}
            {result.tooLarge
              ? "Оберіть період — забагато даних."
              : `Рухів у вибірці: ${result.rowCount}.`}
          </p>
        </div>
        <ReportExportButtons
          reportId="sales-summary"
          query={params.toString()}
        />
      </div>

      <SalesFlexConfig
        dimensions={dimensions}
        indicators={indicators}
        initial={{
          from: params.get("from") ?? "",
          to: params.get("to") ?? "",
          groups: result.groups,
          indicators: result.indicators,
          totals: result.showTotals,
          filters: initialFilters,
        }}
      />

      {result.tooLarge ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
          Забагато рухів ({result.rowCount.toLocaleString("uk-UA")}) для звіту
          без періоду. Оберіть період «з / по» та натисніть «Сформувати».
        </div>
      ) : (
        <SalesFlexTree
          tree={result.tree}
          indicators={result.indicatorDefs}
          grand={result.grand}
          showTotals={result.showTotals}
        />
      )}
    </div>
  );
}
