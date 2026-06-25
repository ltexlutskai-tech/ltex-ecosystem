/**
 * Спільний резолвер даних звіту за `reportId` + query-параметрами (← Фаза 7).
 *
 * Один builder для CSV- і XLSX-роутів — щоб не дублювати switch по звітах і
 * нормалізацію періоду/порогу. Повертає готовий `ReportShape` або null, якщо
 * `reportId` невідомий (роут віддає 404).
 */

import {
  reportDebts,
  reportSalesBySupplier,
  type ReportShape,
} from "@/lib/reports/analyst-reports";
import {
  buildMarginFlexReport,
  flattenMarginToReportShape,
} from "@/lib/reports/margin-flex";
import {
  buildCashflowFlexReport,
  flattenToReportShape as flattenCashflowToReportShape,
} from "@/lib/reports/cashflow-flex";
import {
  buildSalesSummaryReport,
  buildStockBalanceReport,
  buildReconciliationReportShape,
} from "@/lib/reports/registry-report-builders";
import type { PeriodPreset } from "@/lib/finance/owner-stats";

const VALID_PERIODS: PeriodPreset[] = ["today", "week", "month", "year", "all"];

/** Нормалізує `?period=` до валідного пресету (дефолт — month). */
export function parsePeriod(raw: string | null): PeriodPreset {
  return VALID_PERIODS.includes(raw as PeriodPreset)
    ? (raw as PeriodPreset)
    : "month";
}

/** Нормалізує `?threshold=` (днів прострочки) у діапазон 0..3650 (дефолт 14). */
export function parseThreshold(raw: string | null): number {
  const n = parseInt(raw ?? "14", 10);
  if (Number.isNaN(n)) return 14;
  return Math.min(3650, Math.max(0, n));
}

/**
 * Будує `ReportShape` за `reportId`. Повертає null для невідомого звіту.
 *
 * @param reportId  ключ звіту (`sales-by-supplier` | `debts` | `margin` |
 *                  `sales-summary` | `cashflow` | `stock-balance` |
 *                  `reconciliation`)
 * @param params    URLSearchParams запиту (period / threshold / from / to /
 *                  group / clientId — залежно від звіту)
 */
export async function resolveReport(
  reportId: string,
  params: URLSearchParams,
): Promise<ReportShape | null> {
  switch (reportId) {
    case "sales-by-supplier":
      return reportSalesBySupplier(parsePeriod(params.get("period")));
    case "debts":
      return reportDebts(parseThreshold(params.get("threshold")));
    case "margin": {
      const result = await buildMarginFlexReport(params);
      if (result.tooLarge) {
        return {
          title: "Маржа / Валовий прибуток",
          period: {
            from: new Date(),
            to: new Date(),
            label: "За обраний період",
          },
          headers: ["Групування"],
          rows: [["Оберіть період — забагато даних для експорту."]],
        };
      }
      return flattenMarginToReportShape(result);
    }
    case "sales-summary":
      return buildSalesSummaryReport(params);
    case "cashflow": {
      const result = await buildCashflowFlexReport(params);
      if (result.tooLarge) {
        return {
          title: "Рух коштів (ДДС)",
          period: {
            from: new Date(),
            to: new Date(),
            label: "За обраний період",
          },
          headers: ["Групування"],
          rows: [["Оберіть період — забагато даних для експорту."]],
        };
      }
      return flattenCashflowToReportShape(result);
    }
    case "stock-balance":
      return buildStockBalanceReport(params);
    case "reconciliation":
      return buildReconciliationReportShape(params);
    default:
      return null;
  }
}
