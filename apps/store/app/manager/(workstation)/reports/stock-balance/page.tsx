import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  buildStockFlexReport,
  DIMENSIONS,
  INDICATORS,
  ATTR_COLUMNS,
  DEFAULT_ATTRS,
} from "@/lib/reports/stock-flex";
import { ReportsNav } from "../_components/reports-nav";
import { ReportExportButtons } from "../_components/report-export-buttons";
import { FlexConfig } from "../_components/flex-config";
import {
  FlexTree,
  type IndicatorCol,
  type AttrCol,
} from "../_components/flex-tree";
import type { FilterOp } from "@/lib/reports/flex-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звіт: Залишки складу | L-TEX" };

export default async function StockBalanceReportPage({
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
  // Балансовий звіт: `from` ігнорується, тому в гейті — `to`/`groups`/`go`.
  const submitted =
    params.has("go") || params.has("to") || params.has("groups");

  let result: Awaited<ReturnType<typeof buildStockFlexReport>> | null = null;
  let errored = false;
  if (submitted) {
    try {
      result = await buildStockFlexReport(params);
    } catch (e) {
      errored = true;
      console.error("[L-TEX] Звіт залишків складу не сформовано", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const dimensions = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));
  const indicators = INDICATORS.map((i) => ({ key: i.key, label: i.label }));
  const attrOptions = ATTR_COLUMNS.map((c) => ({ key: c.key, label: c.label }));

  // Усі показники залишків — qty/weight (summable), без percent.
  const treeIndicators: IndicatorCol[] = (result?.indicatorDefs ?? []).map(
    (d) => ({ key: d.key, label: d.label, kind: d.kind }),
  );

  // Довідкові колонки товару (1С «Остатки товаров») — на product-leaf рядках.
  const treeAttrCols: AttrCol[] = (result?.attrColDefs ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    kind: d.kind,
  }));

  const initialFilters: Record<string, string> = {};
  const initialFilterOps: Record<string, FilterOp> = {};
  for (const d of DIMENSIONS) {
    const v = params.get(`f_${d.key}`);
    const op = params.get(`fop_${d.key}`);
    if (v != null) initialFilters[d.key] = v;
    if (op) {
      initialFilterOps[d.key] = op as FilterOp;
      if (!(d.key in initialFilters)) initialFilters[d.key] = "";
    }
  }
  const cfgGroups = params.get("groups")?.split(",").filter(Boolean) ?? [
    "category",
  ];
  const cfgInd = params.get("ind")?.split(",").filter(Boolean) ?? [
    "qtyBalance",
  ];
  const cfgAttrs =
    params.get("cols")?.split(",").filter(Boolean) ?? DEFAULT_ATTRS;
  const cfgTotals = params.get("totals") !== "0";

  const asOfLabel = params.get("to") || "сьогодні";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ReportsNav />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Звіт: Залишки складу
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Гнучкий звіт залишків (к-сть + вага) станом на дату «по», з
            довільним групуванням та відборами.{" "}
            {!submitted
              ? "Налаштуйте параметри та натисніть «Сформувати»."
              : errored
                ? "Помилка формування."
                : result?.tooLarge
                  ? "Оберіть дату «станом на» — забагато даних."
                  : `Залишок станом на ${asOfLabel}. Рухів у вибірці: ${
                      result?.rowCount ?? 0
                    }.`}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Показано лише каталожні товари; службові/витратні позиції (напр.
            паливо) приховано —{" "}
            <a
              href={`?${new URLSearchParams({ ...Object.fromEntries(params), showUnknown: "1", go: "1" }).toString()}`}
              className="underline"
            >
              показати всі
            </a>
            . «Вага, кг» — опційний показник (ваговий регістр фіксує переважно
            вибуття, тож ваговий баланс неповний). Історія складських документів
            (повернення/перепаковки/списання) ще переноситься — залишки за
            минулі дати можуть бути неповними.
          </p>
        </div>
        <ReportExportButtons
          reportId="stock-balance"
          query={params.toString()}
        />
      </div>

      <FlexConfig
        dimensions={dimensions}
        indicators={indicators}
        hideFrom
        commonFilters={[
          "category",
          "article",
          "product",
          "warehouse",
          "quality",
        ]}
        attrOptions={attrOptions}
        initialAttrs={cfgAttrs}
        filterOptions={result?.filterOptions ?? {}}
        initial={{
          from: "",
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
          Оберіть дату «станом на», групування та показники зліва й натисніть
          «Сформувати».
        </div>
      ) : errored ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
          Не вдалося сформувати звіт (можливо, забагато даних). Оберіть дату
          «станом на» або звузьте відбори й спробуйте ще раз.
        </div>
      ) : result?.tooLarge ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
          Забагато рухів ({result.rowCount.toLocaleString("uk-UA")}) для звіту
          без дати. Оберіть дату «станом на» та натисніть «Сформувати».
        </div>
      ) : (
        result && (
          <FlexTree
            tree={result.tree}
            indicators={treeIndicators}
            attrColumns={treeAttrCols}
            grand={result.grand}
            showTotals={result.showTotals}
          />
        )
      )}
    </div>
  );
}
