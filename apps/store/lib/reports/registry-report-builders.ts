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
 *   sales-summary  — `?from&to&group=client|product|agent`
 *   cashflow       — `?from&to`
 *   stock-balance  — `?to&group=product|quality`  (залишок на дату)
 *   reconciliation — `?clientId&from&to`
 */

import { prisma, Prisma } from "@ltex/db";
import {
  buildOccurredAtFilter,
  parseDateParam,
} from "@/lib/manager/registry-view";
import type { ReportShape } from "@/lib/reports/analyst-reports";
import {
  summarizeSales,
  totalSales,
  summarizeCashFlow,
  totalCashFlow,
  summarizeStockBalance,
  totalStock,
  type SalesGroupBy,
  type SalesMovementLite,
  type CashFlowMovementLite,
  type StockGroupBy,
  type StockMovementLite,
} from "@/lib/reports/registry-reports";
import { buildReconciliationReport } from "@/lib/reports/reconciliation";

const SALES_LIMIT = 5000;
const CASHFLOW_LIMIT = 20000;
const STOCK_LIMIT = 50000;

/** Період-заглушка для звітів з власною фільтрацією дат (не використовується роутами). */
function freePeriod(label: string): ReportShape["period"] {
  const now = new Date();
  return { from: now, to: now, label };
}

function parseSalesGroup(raw: string | null): SalesGroupBy {
  return raw === "product" || raw === "agent" ? raw : "client";
}

function parseStockGroup(raw: string | null): StockGroupBy {
  return raw === "quality" ? "quality" : "product";
}

// ─── sales-summary ──────────────────────────────────────────────────────────
export async function buildSalesSummaryReport(
  params: URLSearchParams,
): Promise<ReportShape> {
  const group = parseSalesGroup(params.get("group"));
  const where: Prisma.SalesMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(
    params.get("from") ?? undefined,
    params.get("to") ?? undefined,
  );
  if (occurredAt) where.occurredAt = occurredAt;

  const movements = await prisma.salesMovement.findMany({
    where,
    take: SALES_LIMIT,
    select: {
      clientCode1C: true,
      clientId: true,
      productCode1C: true,
      agentCode1C: true,
      qty: true,
      weightKg: true,
      revenueEur: true,
      revenueNoDiscountEur: true,
      recordKind: true,
    },
  });

  const clientIds = [
    ...new Set(movements.map((m) => m.clientId).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const agentCodes = [
    ...new Set(movements.map((m) => m.agentCode1C).filter(Boolean)),
  ] as string[];
  const [clients, products, agents] = await Promise.all([
    clientIds.length
      ? prisma.mgrClient.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    productCodes.length
      ? prisma.product.findMany({
          where: { code1C: { in: productCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    agentCodes.length
      ? prisma.user.findMany({
          where: { code1C: { in: agentCodes } },
          select: { code1C: true, fullName: true },
        })
      : Promise.resolve([]),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const productName = new Map(
    products.map((p) => [p.code1C ?? "", p.name] as const),
  );
  const agentName = new Map(
    agents.map((a) => [a.code1C ?? "", a.fullName] as const),
  );

  const lite: SalesMovementLite[] = movements.map((m) => ({
    clientCode1C: m.clientCode1C,
    clientName: m.clientId ? (clientName.get(m.clientId) ?? null) : null,
    productCode1C: m.productCode1C,
    productName: m.productCode1C
      ? (productName.get(m.productCode1C) ?? null)
      : null,
    agentCode1C: m.agentCode1C,
    agentName: m.agentCode1C ? (agentName.get(m.agentCode1C) ?? null) : null,
    qty: Number(m.qty),
    weightKg: m.weightKg == null ? null : Number(m.weightKg),
    revenueEur: Number(m.revenueEur),
    revenueNoDiscountEur:
      m.revenueNoDiscountEur == null ? null : Number(m.revenueNoDiscountEur),
    recordKind: m.recordKind,
  }));

  const summary = summarizeSales(lite, group);
  const grand = totalSales(summary);

  const headers = ["Назва", "К-сть", "Вага, кг", "Виручка €", "Знижки €"];
  const rows: ReportShape["rows"] = summary.map((r) => [
    r.label,
    r.qty,
    r.weightKg,
    r.revenueEur,
    r.discountEur,
  ]);
  rows.push([
    grand.label,
    grand.qty,
    grand.weightKg,
    grand.revenueEur,
    grand.discountEur,
  ]);

  return {
    title: "Підсумок продажів",
    period: freePeriod("За обраний період"),
    headers,
    rows,
  };
}

// ─── cashflow ───────────────────────────────────────────────────────────────
export async function buildCashFlowReport(
  params: URLSearchParams,
): Promise<ReportShape> {
  const where: Prisma.CashFlowMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(
    params.get("from") ?? undefined,
    params.get("to") ?? undefined,
  );
  if (occurredAt) where.occurredAt = occurredAt;

  const movements = await prisma.cashFlowMovement.findMany({
    where,
    take: CASHFLOW_LIMIT,
    select: {
      articleCode1C: true,
      direction: true,
      amountUah: true,
      amountUpr: true,
    },
  });

  const articleCodes = [
    ...new Set(movements.map((m) => m.articleCode1C).filter(Boolean)),
  ] as string[];
  const articles = articleCodes.length
    ? await prisma.mgrCashFlowArticle.findMany({
        where: { code1C: { in: articleCodes } },
        select: { code1C: true, name: true },
      })
    : [];
  const articleName = new Map(
    articles.map((a) => [a.code1C ?? "", a.name] as const),
  );

  const lite: CashFlowMovementLite[] = movements.map((m) => ({
    articleCode1C: m.articleCode1C,
    articleName: m.articleCode1C
      ? (articleName.get(m.articleCode1C) ?? null)
      : null,
    direction: m.direction,
    amountUah: Number(m.amountUah),
    amountUpr: m.amountUpr == null ? null : Number(m.amountUpr),
  }));

  const summary = summarizeCashFlow(lite);
  const grand = totalCashFlow(summary);

  const headers = ["Стаття", "Прихід, ₴", "Розхід, ₴", "Сальдо, ₴"];
  const rows: ReportShape["rows"] = summary.map((r) => [
    r.label,
    r.inflowUah,
    r.outflowUah,
    r.netUah,
  ]);
  rows.push([grand.label, grand.inflowUah, grand.outflowUah, grand.netUah]);

  return {
    title: "Рух коштів (ДДС)",
    period: freePeriod("За обраний період"),
    headers,
    rows,
  };
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
