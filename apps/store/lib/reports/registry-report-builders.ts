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
 *   stock-balance  — `?to&group=product|quality`  (залишок на дату)
 *   reconciliation — `?clientId&from&to`
 *
 * Примітка: `cashflow` тепер гнучкий звіт (`cashflow-flex.ts`) і викликається
 * напряму з `resolve-report.ts` (тут більше НЕ обгортається).
 */

import { prisma, Prisma } from "@ltex/db";
import {
  buildOccurredAtFilter,
  parseDateParam,
} from "@/lib/manager/registry-view";
import type { ReportShape } from "@/lib/reports/analyst-reports";
import {
  summarizeStockBalance,
  totalStock,
  type StockGroupBy,
  type StockMovementLite,
} from "@/lib/reports/registry-reports";
import {
  buildSalesFlexReport,
  flattenToReportShape,
} from "@/lib/reports/sales-flex";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";

const STOCK_LIMIT = 50000;

/** Період-заглушка для звітів з власною фільтрацією дат (не використовується роутами). */
function freePeriod(label: string): ReportShape["period"] {
  const now = new Date();
  return { from: now, to: now, label };
}

function parseStockGroup(raw: string | null): StockGroupBy {
  return raw === "quality" ? "quality" : "product";
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

// ─── stock-balance ──────────────────────────────────────────────────────────
export async function buildStockBalanceReport(
  params: URLSearchParams,
): Promise<ReportShape> {
  const group = parseStockGroup(params.get("group"));
  const asOf = parseDateParam(params.get("to") ?? undefined);
  const where: Prisma.StockMovementWhereInput = {};
  if (asOf) {
    const end = new Date(asOf);
    end.setHours(23, 59, 59, 999);
    where.occurredAt = { lte: end };
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    take: STOCK_LIMIT,
    select: {
      productCode1C: true,
      quality: true,
      qty: true,
      weightKg: true,
      recordKind: true,
    },
  });

  const productCodes = [...new Set(movements.map((m) => m.productCode1C))];
  const products = productCodes.length
    ? await prisma.product.findMany({
        where: { code1C: { in: productCodes } },
        select: { code1C: true, name: true },
      })
    : [];
  const productName = new Map(
    products.map((p) => [p.code1C ?? "", p.name] as const),
  );

  const lite: StockMovementLite[] = movements.map((m) => ({
    productCode1C: m.productCode1C,
    productName: productName.get(m.productCode1C) ?? null,
    quality: m.quality,
    qty: Number(m.qty),
    weightKg: m.weightKg == null ? null : Number(m.weightKg),
    recordKind: m.recordKind,
  }));

  const summary = summarizeStockBalance(lite, group);
  const grand = totalStock(summary);

  const headers = ["Назва", "К-сть, шт", "Вага, кг"];
  const rows: ReportShape["rows"] = summary.map((r) => [
    r.label,
    r.qty,
    r.weightKg,
  ]);
  rows.push([grand.label, grand.qty, grand.weightKg]);

  return {
    title: "Залишки складу",
    period: freePeriod("Станом на дату"),
    headers,
    rows,
  };
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
