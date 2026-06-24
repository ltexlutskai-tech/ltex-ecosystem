import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  buildMarginFlexReport,
  deriveMarginPct,
  MARGIN_DIMENSIONS,
  MARGIN_INDICATORS,
} from "@/lib/reports/margin-flex";
import { ReportsNav } from "../_components/reports-nav";
import { ReportExportButtons } from "../_components/report-export-buttons";
import { FlexConfig } from "../_components/flex-config";
import { FlexTree, type IndicatorCol } from "../_components/flex-tree";

export const dynamic = "force-dynamic";
export const metadata = { title: "Маржа / Валовий прибуток | L-TEX" };

export default async function Page({
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

  const result = await buildMarginFlexReport(params);

  const dimensions = MARGIN_DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
  }));
  const indicators = MARGIN_INDICATORS.map((i) => ({
    key: i.key,
    label: i.label,
  }));

  // Колонки дерева: похідна «Маржа %» рахується з агрегатів вузла (НЕ сума).
  const treeIndicators: IndicatorCol[] = result.indicatorDefs.map((d) =>
    d.kind === "percent"
      ? { key: d.key, label: d.label, kind: "percent", derive: deriveMarginPct }
      : { key: d.key, label: d.label, kind: "money" },
  );

  const initialFilters: Record<string, string> = {};
  for (const d of MARGIN_DIMENSIONS) {
    const v = params.get(`f_${d.key}`);
    if (v) initialFilters[d.key] = v;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ReportsNav />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Маржа / Валовий прибуток
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Гнучкий звіт з довільним групуванням, показниками та відборами.{" "}
            {result.tooLarge
              ? "Оберіть період — забагато даних."
              : `Рядків у вибірці: ${result.rowCount}.`}
          </p>
        </div>
        <ReportExportButtons reportId="margin" query={params.toString()} />
      </div>

      <FlexConfig
        dimensions={dimensions}
        indicators={indicators}
        commonFilters={["category", "agent", "client", "product"]}
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
          Забагато рядків ({result.rowCount.toLocaleString("uk-UA")}) для звіту
          без періоду. Оберіть період «з / по» та натисніть «Сформувати».
        </div>
      ) : (
        <FlexTree
          tree={result.tree}
          indicators={treeIndicators}
          grand={result.grand}
          showTotals={result.showTotals}
        />
      )}
    </div>
  );
}
