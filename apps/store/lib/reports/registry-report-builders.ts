/**
 * DB-backed обгортки звітів над матеріалізованими регістрами (Фаза 2/6) у
 * вигляді `ReportShape` (← для generic CSV/XLSX-роутів `[reportId]/{csv,xlsx}`).
 *
 * Сторінки цих звітів (`/manager/reports/{sales-summary,cashflow,stock-balance}`
 * + `reconciliation`) рендерять власну верстку, тому ці білдери НЕ дублюють UI —
 * вони лише читають ті самі рухи з Prisma, делегують агрегацію чистим функціям
 * з `registry-reports.ts` і повертають `{ headers, rows, title, period }`.
 *
 * Параметри передаються через query (як для margin `?group=`):
 *   sales-summary  — гнучкий: `?from&to&groups=<csv dims>&ind=<csv>&f_<dim>=…`
 *   reconciliation — `?clientId&from&to`
 *
 * Примітка: `cashflow` і `stock-balance` тепер гнучкі звіти
 * (`cashflow-flex.ts` / `stock-flex.ts`) і викликаються напряму з
 * `resolve-report.ts` (тут більше НЕ обгортаються).
 */

import { parseDateParam } from "@/lib/manager/registry-view";
import type { ReportShape } from "@/lib/reports/analyst-reports";
import {
  buildSalesFlexReport,
  flattenToReportShape,
} from "@/lib/reports/sales-flex";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";

/** Період-заглушка для звітів з власною фільтрацією дат (не використовується роутами). */
function freePeriod(label: string): ReportShape["period"] {
  const now = new Date();
  return { from: now, to: now, label };
}

// ─── sales-summary (гнучкий звіт) ────────────────────────────────────────────
// Делегує гнучкому білдеру (sales-flex) і сплющує дерево у плоский ReportShape
// для CSV/XLSX. Параметри: ?from&to&groups=client,product&ind=qty,...&f_<dim>=…
export async function buildSalesSummaryReport(
  params: URLSearchParams,
): Promise<ReportShape> {
  const result = await buildSalesFlexReport(params);
  if (result.tooLarge) {
    return {
      title: "Підсумок продажів",
      period: freePeriod("За обраний період"),
      headers: ["Групування"],
      rows: [["Оберіть період — забагато даних для експорту."]],
    };
  }
  return flattenToReportShape(result);
}

// ─── reconciliation ─────────────────────────────────────────────────────────
export async function buildReconciliationReportShape(
  params: URLSearchParams,
): Promise<ReportShape | null> {
  const clientId = params.get("clientId");
  if (!clientId) return null;

  const from = parseDateParam(params.get("from") ?? undefined) ?? null;
  const to = parseDateParam(params.get("to") ?? undefined) ?? null;
  const report = await buildReconciliationReport(clientId, from, to);
  if (!report) return null;

  const headers = [
    "Дата",
    "Операція",
    "Джерело",
    "Дебет €",
    "Кредит €",
    "Сальдо €",
  ];
  const rows: ReportShape["rows"] = report.rows.map((r) => [
    new Date(r.occurredAt),
    r.kindLabel,
    r.sourceLabel,
    r.debitEur,
    r.creditEur,
    r.runningBalanceEur,
  ]);
  // Підсумковий рядок «Разом».
  rows.push([
    "Разом",
    "",
    "",
    report.totalDebitEur,
    report.totalCreditEur,
    report.closingBalanceEur,
  ]);

  const periodLabel =
    from || to
      ? `${from ? from.toLocaleDateString("uk-UA") : "…"} — ${
          to ? to.toLocaleDateString("uk-UA") : "…"
        }`
      : "За весь час";

  return {
    title: `Акт звірки — ${report.clientName}`,
    period: freePeriod(periodLabel),
    headers,
    rows,
  };
}
