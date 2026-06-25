import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  buildMarginFlexReport,
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

  // Легкий старт: важку агрегацію рахуємо ЛИШЕ після «Сформувати».
  const submitted =
    params.has("go") ||
    params.has("from") ||
    params.has("to") ||
    params.has("groups");

  let result: Awaited<ReturnType<typeof buildMarginFlexReport>> | null = null;
  let errored = false;
  if (submitted) {
    try {
      result = await buildMarginFlexReport(params);
    } catch (e) {
      errored = true;
      console.error("[L-TEX] Звіт маржі не сформовано", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const dimensions = MARGIN_DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
  }));
  const indicators = MARGIN_INDICATORS.map((i) => ({
    key: i.key,
    label: i.label,
  }));

  // Колонки дерева: похідна «Маржа %» рахується з агрегатів вузла (НЕ сума).
  // Передаємо серіалізовані ключі num/den (НЕ функцію — інакше Server→Client
  // серіалізація падає «Functions cannot be passed to Client Components»).
  const treeIndicators: IndicatorCol[] = (result?.indicatorDefs ?? []).map(
    (d) =>
      d.kind === "percent"
        ? {
            key: d.key,
            label: d.label,
            kind: "percent",
            percent: { num: "grossEur", den: "revenueEur" },
          }
        : { key: d.key, label: d.label, kind: "money" },
  );

  const initialFilters: Record<string, string> = {};
  for (const d of MARGIN_DIMENSIONS) {
    const v = params.get(`f_${d.key}`);
    if (v) initialFilters[d.key] = v;
  }
  const cfgGroups = params.get("groups")?.split(",").filter(Boolean) ?? [
    "product",
  ];
  const cfgInd = params.get("ind")?.split(",").filter(Boolean) ?? [
    "revenueEur",
    "costEur",
    "grossEur",
    "marginPct",
  ];
  const cfgTotals = params.get("totals") !== "0";

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
            {!submitted
              ? "Налаштуйте параметри та натисніть «Сформувати»."
              : errored
                ? "Помилка формування."
                : result?.tooLarge
                  ? "Оберіть період — забагато даних."
                  : `Рядків у вибірці: ${result?.rowCount ?? 0}.`}
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
          groups: cfgGroups,
          indicators: cfgInd,
          totals: cfgTotals,
          filters: initialFilters,
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
          Забагато рядків ({result.rowCount.toLocaleString("uk-UA")}) для звіту
          без періоду. Оберіть період «з / по» та натисніть «Сформувати».
        </div>
      ) : (
        result && (
          <FlexTree
            tree={result.tree}
            indicators={treeIndicators}
            grand={result.grand}
            showTotals={result.showTotals}
          />
        )
      )}
    </div>
  );
}
