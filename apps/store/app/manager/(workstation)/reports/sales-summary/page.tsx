import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  buildSalesFlexReport,
  DIMENSIONS,
  INDICATORS,
} from "@/lib/reports/sales-flex";
import { ReportsNav } from "../_components/reports-nav";
import { ReportExportButtons } from "../_components/report-export-buttons";
import { FlexConfig } from "../_components/flex-config";
import { FlexTree } from "../_components/flex-tree";
import type { FilterOp } from "@/lib/reports/flex-filters";

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

  // Легкий старт: важку агрегацію рахуємо ЛИШЕ після «Сформувати» (прапор `go`
  // або наявні параметри звіту), а не на кожне відкриття сторінки.
  const submitted =
    params.has("go") ||
    params.has("from") ||
    params.has("to") ||
    params.has("groups");

  let result: Awaited<ReturnType<typeof buildSalesFlexReport>> | null = null;
  let errored = false;
  if (submitted) {
    try {
      result = await buildSalesFlexReport(params);
    } catch (e) {
      errored = true;
      console.error("[L-TEX] Звіт продажів не сформовано", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const dimensions = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));
  const indicators = INDICATORS.map((i) => ({ key: i.key, label: i.label }));

  const initialFilters: Record<string, string> = {};
  const initialFilterOps: Record<string, FilterOp> = {};
  for (const d of DIMENSIONS) {
    const v = params.get(`f_${d.key}`);
    const op = params.get(`fop_${d.key}`);
    if (v != null) initialFilters[d.key] = v;
    // filled/empty не мають значення, але мають op → теж створюють рядок.
    if (op) {
      initialFilterOps[d.key] = op as FilterOp;
      if (!(d.key in initialFilters)) initialFilters[d.key] = "";
    }
  }
  const cfgGroups = params.get("groups")?.split(",").filter(Boolean) ?? [
    "client",
  ];
  const cfgInd = params.get("ind")?.split(",").filter(Boolean) ?? [
    "qty",
    "weightKg",
    "revenueEur",
  ];
  const cfgTotals = params.get("totals") !== "0";

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
            {!submitted
              ? "Налаштуйте параметри та натисніть «Сформувати»."
              : errored
                ? "Помилка формування."
                : result?.tooLarge
                  ? "Оберіть період — забагато даних."
                  : `Рухів у вибірці: ${result?.rowCount ?? 0}.`}
          </p>
        </div>
        <ReportExportButtons
          reportId="sales-summary"
          query={params.toString()}
        />
      </div>

      <FlexConfig
        dimensions={dimensions}
        indicators={indicators}
        filterOptions={result?.filterOptions ?? {}}
        initial={{
          from: params.get("from") ?? "",
          to: params.get("to") ?? "",
          groups: cfgGroups,
          indicators: cfgInd,
          totals: cfgTotals,
          filters: initialFilters,
          filterOps: initialFilterOps,
        }}
      />

      {!submitted ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          Оберіть період, групування та показники зліва й натисніть
          «Сформувати».
        </div>
      ) : errored ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
          Не вдалося сформувати звіт (можливо, забагато даних). Звузьте період
          або відбори й спробуйте ще раз.
        </div>
      ) : result?.tooLarge ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
          Забагато рухів ({result.rowCount.toLocaleString("uk-UA")}) для звіту
          без періоду. Оберіть період «з / по» та натисніть «Сформувати».
        </div>
      ) : (
        result && (
          <FlexTree
            tree={result.tree}
            indicators={result.indicatorDefs}
            grand={result.grand}
            showTotals={result.showTotals}
          />
        )
      )}
    </div>
  );
}
