/**
 * Спільний резолвер даних звіту за `reportId` + query-параметрами (← Фаза 7).
 *
 * Один builder для CSV- і XLSX-роутів — щоб не дублювати switch по звітах і
 * нормалізацію періоду/порогу. Повертає готовий `ReportShape` або null, якщо
 * `reportId` невідомий (роут віддає 404).
 */

import {
  reportDebts,
  reportSalesByClient,
  reportSalesBySupplier,
  type ReportShape,
} from "@/lib/reports/analyst-reports";
import {
  reportMargin,
  MARGIN_GROUPS,
  type MarginGroupBy,
} from "@/lib/reports/margin-report";
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
 * @param reportId  ключ звіту (`sales-by-client` | `sales-by-supplier` | `debts`)
 * @param params    URLSearchParams запиту (для period / threshold)
 */
export async function resolveReport(
  reportId: string,
  params: URLSearchParams,
): Promise<ReportShape | null> {
  switch (reportId) {
    case "sales-by-client":
      return reportSalesByClient(parsePeriod(params.get("period")));
    case "sales-by-supplier":
      return reportSalesBySupplier(parsePeriod(params.get("period")));
    case "debts":
      return reportDebts(parseThreshold(params.get("threshold")));
    case "margin": {
      const raw = params.get("group") ?? "product";
      const group: MarginGroupBy = MARGIN_GROUPS.includes(raw as MarginGroupBy)
        ? (raw as MarginGroupBy)
        : "product";
      return reportMargin(group, parsePeriod(params.get("period")));
    }
    default:
      return null;
  }
}
