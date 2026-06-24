/**
 * Гнучкий (універсальний) звіт «Маржа / Валовий прибуток» — аналог гнучкого
 * звіту «Продажі», але над парою джерел Виручка + Собівартість.
 *
 *   Виручка     ← SaleItem.priceEur проведених реалізацій (status='posted') за
 *                 період (EUR-головна сума).
 *   Собівартість ← CostMovement.costEur (1С AccumRg ПродажиСебестоимость
 *                 `_AccumRg5634`), зв'язана з реалізацією через
 *                 recorderCode1C = Sale.code1C.
 *
 * Архітектура (повторює `sales-flex.ts`):
 *   1. Гранулярність нормалізованого рядка = (реалізація, товар). Виручка
 *      групується по (sale.code1C, productKey); собівартість — по
 *      (recorderCode1C, productKey). Об'єднується у рядки з полями
 *      revenueEur / costEur / grossEur (= revenue − cost).
 *   2. Рядки лише з собівартістю (без виручки) теж створюються (revenue=0), щоб
 *      «прихована» собівартість не зникала.
 *   3. ВИМІРИ резолвляться через реалізацію → контрагент → MgrClient (за
 *      Customer.code1C → MgrClient.code1C): клієнт / область / місто / агент;
 *      товар і категорія — через Product.
 *   4. Дерево будується тим самим чистим `buildSalesTree`. Три базові
 *      сумовні показники (revenueEur/costEur/grossEur) агрегуються ЗАВЖДИ, тож
 *      похідна «Маржа %» обчислюється з агрегатів на БУДЬ-ЯКОМУ вузлі.
 */

import { prisma } from "@ltex/db";
import { buildOccurredAtFilter } from "@/lib/manager/registry-view";
import {
  buildSalesTree,
  grandTotal,
  type NormalizedRow,
  type TreeNode,
} from "@/lib/reports/sales-flex";
import type { ReportShape } from "@/lib/reports/analyst-reports";

const MONTH_NAMES = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Маржа % = валовий / виручка × 100; null коли виручка ≤ 0. */
export function deriveMarginPct(v: Record<string, number>): number | null {
  const revenue = v.revenueEur ?? 0;
  if (revenue <= 0) return null;
  return round2(((v.grossEur ?? 0) / revenue) * 100);
}

// ─── Реєстр вимірів ───────────────────────────────────────────────────────────

/** Контекст однієї реалізації (резолвлений з MgrClient + Product через Sale). */
export interface MarginRowContext {
  saleCode: string;
  productKey: string; // productId ?? productCode1C ?? "—"
  productLabel: string;
  categoryId: string;
  categoryLabel: string;
  clientId: string;
  clientLabel: string;
  region: string | null;
  city: string | null;
  agent: string | null;
  occurredAt: Date;
}

export interface MarginDimensionDef {
  key: string;
  label: string;
  resolve(ctx: MarginRowContext): { id: string; label: string };
}

export const MARGIN_DIMENSIONS: readonly MarginDimensionDef[] = [
  {
    key: "product",
    label: "Товар",
    resolve: (c) => ({ id: c.productKey, label: c.productLabel }),
  },
  {
    key: "category",
    label: "Категорія",
    resolve: (c) => ({ id: c.categoryId, label: c.categoryLabel }),
  },
  {
    key: "client",
    label: "Клієнт",
    resolve: (c) => ({ id: c.clientId, label: c.clientLabel }),
  },
  {
    key: "region",
    label: "Область",
    resolve: (c) => {
      const r = c.region?.trim() || null;
      return { id: r ?? "—", label: r ?? "Без області" };
    },
  },
  {
    key: "city",
    label: "Місто",
    resolve: (c) => {
      const ci = c.city?.trim() || null;
      return { id: ci ?? "—", label: ci ?? "Без міста" };
    },
  },
  {
    key: "agent",
    label: "Торговий агент",
    resolve: (c) => {
      const a = c.agent?.trim() || null;
      return { id: a ?? "—", label: a ?? "Без агента" };
    },
  },
  {
    key: "year",
    label: "Рік",
    resolve: (c) => {
      const y = String(c.occurredAt.getFullYear());
      return { id: y, label: y };
    },
  },
  {
    key: "month",
    label: "Місяць",
    resolve: (c) => {
      const y = c.occurredAt.getFullYear();
      const mo = c.occurredAt.getMonth();
      const id = `${y}-${String(mo + 1).padStart(2, "0")}`;
      return { id, label: `${id} (${MONTH_NAMES[mo]})` };
    },
  },
];

const MARGIN_DIMENSION_BY_KEY = new Map(
  MARGIN_DIMENSIONS.map((d) => [d.key, d]),
);

// ─── Реєстр показників ──────────────────────────────────────────────────────

export type MarginIndicatorKind = "money" | "percent";

export interface MarginIndicatorDef {
  key: string;
  label: string;
  kind: MarginIndicatorKind;
}

export const MARGIN_INDICATORS: readonly MarginIndicatorDef[] = [
  { key: "revenueEur", label: "Виручка, €", kind: "money" },
  { key: "costEur", label: "Собівартість, €", kind: "money" },
  { key: "grossEur", label: "Валовий прибуток, €", kind: "money" },
  { key: "marginPct", label: "Маржа, %", kind: "percent" },
];

const MARGIN_INDICATOR_BY_KEY = new Map(
  MARGIN_INDICATORS.map((i) => [i.key, i]),
);

/** Три базові сумовні показники — агрегуються деревом ЗАВЖДИ. */
const BASE_SUM_INDICATORS = ["revenueEur", "costEur", "grossEur"] as const;

// ─── Парс параметрів ──────────────────────────────────────────────────────────

export const MARGIN_DEFAULT_GROUPS = ["product"];
export const MARGIN_DEFAULT_INDICATORS = [
  "revenueEur",
  "costEur",
  "grossEur",
  "marginPct",
];
const MAX_GROUPS = 5;
/** Захист: без періоду і коли проведених рядків > порогу — звіт не будуємо. */
const HARD_CAP = 200000;

function parseGroups(raw: string | null): string[] {
  if (!raw) return [...MARGIN_DEFAULT_GROUPS];
  const out: string[] = [];
  for (const k of raw.split(",").map((s) => s.trim())) {
    if (MARGIN_DIMENSION_BY_KEY.has(k) && !out.includes(k)) out.push(k);
    if (out.length >= MAX_GROUPS) break;
  }
  return out.length ? out : [...MARGIN_DEFAULT_GROUPS];
}

function parseIndicators(raw: string | null): string[] {
  if (!raw) return [...MARGIN_DEFAULT_INDICATORS];
  const out: string[] = [];
  for (const k of raw.split(",").map((s) => s.trim())) {
    if (MARGIN_INDICATOR_BY_KEY.has(k) && !out.includes(k)) out.push(k);
  }
  return out.length ? out : [...MARGIN_DEFAULT_INDICATORS];
}

// ─── Результат ────────────────────────────────────────────────────────────────

export interface MarginFlexResult {
  groups: string[];
  /** Обрані показники (колонки) — порядок зберігається. */
  indicators: string[];
  groupLabels: string[];
  indicatorDefs: { key: string; label: string; kind: MarginIndicatorKind }[];
  tree: TreeNode[];
  grand: Record<string, number>;
  showTotals: boolean;
  rowCount: number;
  tooLarge: boolean;
}

/**
 * Async-білдер: читає виручку (SaleItem) і собівартість (CostMovement) за період,
 * батч-резолвить довідники, нормалізує у рядки (sale, product), будує дерево.
 */
export async function buildMarginFlexReport(
  params: URLSearchParams,
): Promise<MarginFlexResult> {
  const groups = parseGroups(params.get("groups"));
  const indicators = parseIndicators(params.get("ind"));
  const showTotals = params.get("totals") !== "0";
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  // Відбори: f_<dimKey> = contains (case-insensitive) на резолвленому label.
  const filters: { dimKey: string; needle: string }[] = [];
  for (const dim of MARGIN_DIMENSIONS) {
    const v = params.get(`f_${dim.key}`);
    if (v && v.trim()) filters.push({ dimKey: dim.key, needle: v.trim() });
  }

  const indicatorDefs = indicators.map((k) => {
    const d = MARGIN_INDICATOR_BY_KEY.get(k)!;
    return { key: d.key, label: d.label, kind: d.kind };
  });

  const baseResult: MarginFlexResult = {
    groups,
    indicators,
    groupLabels: groups.map((k) => MARGIN_DIMENSION_BY_KEY.get(k)?.label ?? k),
    indicatorDefs,
    tree: [],
    grand: Object.fromEntries(BASE_SUM_INDICATORS.map((k) => [k, 0])),
    showTotals,
    rowCount: 0,
    tooLarge: false,
  };

  const occurredAt = buildOccurredAtFilter(from, to);

  // Захист від «усе за весь час» без періоду.
  if (!occurredAt) {
    const count = await prisma.saleItem.count({
      where: { sale: { status: "posted" } },
    });
    if (count > HARD_CAP) {
      return { ...baseResult, rowCount: count, tooLarge: true };
    }
  }

  // ─── Виручка: SaleItem проведених реалізацій за період ───
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: "posted",
        ...(occurredAt ? { createdAt: occurredAt } : {}),
      },
    },
    select: {
      priceEur: true,
      productId: true,
      product: {
        select: {
          id: true,
          code1C: true,
          name: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      },
      sale: {
        select: {
          code1C: true,
          createdAt: true,
          customer: { select: { code1C: true, name: true } },
        },
      },
    },
  });

  // Контекст реалізації за code1C (для атрибуції собівартості до тих самих груп).
  const saleCustomerByCode = new Map<
    string,
    { customerCode1C: string | null; customerName: string; occurredAt: Date }
  >();
  const customerCodes = new Set<string>();
  const productKeysSeen = new Set<string>();
  for (const it of items) {
    const code = it.sale.code1C;
    if (code && !saleCustomerByCode.has(code)) {
      saleCustomerByCode.set(code, {
        customerCode1C: it.sale.customer?.code1C ?? null,
        customerName: it.sale.customer?.name ?? "—",
        occurredAt: it.sale.createdAt,
      });
    }
    if (it.sale.customer?.code1C) customerCodes.add(it.sale.customer.code1C);
  }

  // Резолв product → контекст (назва + категорія) для cost-рядків без виручки.
  const productCtxById = new Map<
    string,
    { label: string; categoryId: string; categoryLabel: string }
  >();
  const productCtxByCode = new Map<
    string,
    { label: string; categoryId: string; categoryLabel: string }
  >();
  for (const it of items) {
    if (it.product) {
      const ctx = {
        label: it.product.name,
        categoryId: it.product.category?.id ?? it.product.categoryId,
        categoryLabel: it.product.category?.name ?? "—",
      };
      productCtxById.set(it.product.id, ctx);
      if (it.product.code1C) productCtxByCode.set(it.product.code1C, ctx);
    }
  }

  // ─── Собівартість: рухи проведених реалізацій ───
  const saleCodes = [...saleCustomerByCode.keys()];
  const costMovements =
    saleCodes.length > 0
      ? await prisma.costMovement.findMany({
          where: { recorderCode1C: { in: saleCodes } },
          select: {
            recorderCode1C: true,
            productId: true,
            productCode1C: true,
            costEur: true,
          },
        })
      : [];

  // Підтягуємо назви продуктів, що є лише у cost (не зустрілись у виручці).
  const missingProductIds = new Set<string>();
  const missingProductCodes = new Set<string>();
  for (const cm of costMovements) {
    if (cm.productId && !productCtxById.has(cm.productId)) {
      missingProductIds.add(cm.productId);
    } else if (
      !cm.productId &&
      cm.productCode1C &&
      !productCtxByCode.has(cm.productCode1C)
    ) {
      missingProductCodes.add(cm.productCode1C);
    }
  }
  if (missingProductIds.size || missingProductCodes.size) {
    const extra = await prisma.product.findMany({
      where: {
        OR: [
          { id: { in: [...missingProductIds] } },
          { code1C: { in: [...missingProductCodes] } },
        ],
      },
      select: {
        id: true,
        code1C: true,
        name: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });
    for (const p of extra) {
      const ctx = {
        label: p.name,
        categoryId: p.category?.id ?? p.categoryId,
        categoryLabel: p.category?.name ?? "—",
      };
      productCtxById.set(p.id, ctx);
      if (p.code1C) productCtxByCode.set(p.code1C, ctx);
    }
  }

  // Резолв MgrClient за Customer.code1C (область/місто/агент).
  const clientByCode = new Map<
    string,
    { region: string | null; city: string | null; agent: string | null }
  >();
  if (customerCodes.size) {
    const clients = await prisma.mgrClient.findMany({
      where: { code1C: { in: [...customerCodes] } },
      select: {
        code1C: true,
        region: true,
        city: true,
        agent: { select: { fullName: true } },
      },
    });
    for (const c of clients) {
      clientByCode.set(c.code1C ?? "", {
        region: c.region,
        city: c.city,
        agent: c.agent?.fullName ?? null,
      });
    }
  }

  // ─── Збір рядків по (saleCode, productKey) ───
  const byKey = new Map<
    string,
    { ctx: MarginRowContext; revenueEur: number; costEur: number }
  >();

  function productKeyOf(
    productId: string | null,
    productCode1C: string | null,
  ): string {
    return productId ?? productCode1C ?? "—";
  }

  function productLabelOf(
    productId: string | null,
    productCode1C: string | null,
  ): { label: string; categoryId: string; categoryLabel: string } {
    const ctx =
      (productId && productCtxById.get(productId)) ||
      (productCode1C && productCtxByCode.get(productCode1C)) ||
      null;
    if (ctx) return ctx;
    const code = productCode1C ?? productId ?? "—";
    return {
      label: code === "—" ? "—" : `…${code.slice(-6)}`,
      categoryId: "—",
      categoryLabel: "Без категорії",
    };
  }

  function ensure(
    saleCode: string,
    productId: string | null,
    productCode1C: string | null,
  ): { ctx: MarginRowContext; revenueEur: number; costEur: number } {
    const productKey = productKeyOf(productId, productCode1C);
    const compositeKey = `${saleCode} ${productKey}`;
    let entry = byKey.get(compositeKey);
    if (!entry) {
      const sale = saleCustomerByCode.get(saleCode);
      const prod = productLabelOf(productId, productCode1C);
      const cust = sale?.customerCode1C
        ? clientByCode.get(sale.customerCode1C)
        : undefined;
      entry = {
        ctx: {
          saleCode,
          productKey,
          productLabel: prod.label,
          categoryId: prod.categoryId,
          categoryLabel: prod.categoryLabel,
          clientId: sale?.customerCode1C ?? "—",
          clientLabel: sale?.customerName ?? "—",
          region: cust?.region ?? null,
          city: cust?.city ?? null,
          agent: cust?.agent ?? null,
          occurredAt: sale?.occurredAt ?? new Date(),
        },
        revenueEur: 0,
        costEur: 0,
      };
      byKey.set(compositeKey, entry);
    }
    return entry;
  }

  for (const it of items) {
    if (!it.sale.code1C) continue;
    const e = ensure(it.sale.code1C, it.productId, null);
    e.revenueEur += Number(it.priceEur);
  }

  for (const cm of costMovements) {
    const e = ensure(cm.recorderCode1C, cm.productId, cm.productCode1C);
    e.costEur += Number(cm.costEur ?? 0);
  }

  // ─── Нормалізація → рядки ───
  let rows: NormalizedRow[] = [...byKey.values()].map((e) => {
    const dims: NormalizedRow["dims"] = {};
    for (const dim of MARGIN_DIMENSIONS) dims[dim.key] = dim.resolve(e.ctx);
    const revenueEur = e.revenueEur;
    const costEur = e.costEur;
    return {
      dims,
      values: {
        revenueEur,
        costEur,
        grossEur: revenueEur - costEur,
      },
    };
  });

  // Відбори по резолвлених підписах.
  if (filters.length) {
    rows = rows.filter((r) =>
      filters.every((f) => {
        const label = r.dims[f.dimKey]?.label ?? "";
        return label.toLowerCase().includes(f.needle.toLowerCase());
      }),
    );
  }

  // Завжди агрегуємо три базові показники (щоб marginPct рахувалась на вузлі).
  const sumKeys = [...BASE_SUM_INDICATORS];
  const tree = buildSalesTree(rows, groups, sumKeys);
  const grand = grandTotal(rows, sumKeys);

  return { ...baseResult, tree, grand, rowCount: rows.length };
}

// ─── Flat-shape для CSV/XLSX ────────────────────────────────────────────────

/**
 * Сплющує дерево у `ReportShape` (headers + rows) для generic CSV/XLSX-роутів.
 * Перша колонка — «Групування» з відступами; далі — ОБРАНІ показники. Маржа %
 * рендериться рядком (`XX.XX %` / «—»), решта — числа.
 */
export function flattenMarginToReportShape(
  result: MarginFlexResult,
): ReportShape {
  const headers = ["Групування", ...result.indicatorDefs.map((d) => d.label)];

  function cell(
    key: string,
    kind: MarginIndicatorKind,
    values: Record<string, number>,
  ): string | number {
    if (kind === "percent") {
      const v = deriveMarginPct(values);
      return v == null ? "—" : v;
    }
    return values[key] ?? 0;
  }

  const rows: ReportShape["rows"] = [];

  function walk(nodes: TreeNode[]) {
    for (const n of nodes) {
      const indent = "    ".repeat(n.level);
      rows.push([
        `${indent}${n.label}`,
        ...result.indicatorDefs.map((d) => cell(d.key, d.kind, n.values)),
      ]);
      if (n.children.length) walk(n.children);
    }
  }
  walk(result.tree);

  if (result.showTotals) {
    rows.push([
      "Разом",
      ...result.indicatorDefs.map((d) => cell(d.key, d.kind, result.grand)),
    ]);
  }

  const now = new Date();
  return {
    title: "Маржа / Валовий прибуток",
    period: { from: now, to: now, label: "За обраний період" },
    headers,
    rows,
  };
}
