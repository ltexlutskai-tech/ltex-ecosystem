/**
 * Гнучкий (універсальний) звіт «Залишки складу» — аналог гнучких звітів
 * «Продажі» / «Маржа» / «Рух коштів», але над регістром `StockMovement`
 * (1С AccumRg ТоварыНаСкладах / ОстаткиТоваровКомпании).
 *
 * Семантика — БАЛАНС (залишок СТАНОМ НА дату), а НЕ оборот за період:
 *   залишок = Σ підписаних рухів ДО кінця дня `to` включно.
 *   `recordKind`: 0=прихід (+) / 1=розхід (−). Знак застосовується самим
 *   показником (value), тож сумування деревом коректне (як у cashflow за
 *   `direction`). Поле `from` ІГНОРУЄТЬСЯ — баланс завжди «з початку».
 *   Якщо `to` не задано → залишок «на зараз» (усі рухи).
 *
 * Архітектура (повторює `cashflow-flex.ts`):
 *   1. Реєстр ВИМІРІВ (`DIMENSIONS`) — товар / категорія / склад / якість.
 *   2. Реєстр ПОКАЗНИКІВ (`INDICATORS`) — к-сть (qty) і вага (weight),
 *      обидва підписані за `recordKind`.
 *   3. Чиста нормалізація руху → рядок + спільне дерево `buildSalesTree`.
 *   4. Async-білдер `buildStockFlexReport(params)` — читає рухи з Prisma (БЕЗ
 *      ліміту), батч-резолвить довідники у мапи, нормалізує, відбирає, будує
 *      дерево.
 */

import { prisma, Prisma } from "@ltex/db";
import {
  buildSalesTree,
  grandTotal,
  type NormalizedRow,
  type TreeNode,
} from "@/lib/reports/sales-flex";
import type { ReportShape } from "@/lib/reports/analyst-reports";

// ─── Сирий рух (lite-зріз для білдера) ──────────────────────────────────────

/** Поля руху, потрібні для вимірів і показників. */
export interface FlexStockMovement {
  productCode1C: string | null;
  productId: string | null;
  warehouseCode1C: string | null;
  quality: string | null; // hex(Качество) або текст
  qty: number;
  weightKg: number | null;
  recordKind: number; // 0=прихід (+) / 1=розхід (−)
}

/** Резолвлені довідники (мапи code/id → людська назва). */
export interface StockMaps {
  /** productId → назва. */
  productNameById: Map<string, string>;
  /** productCode1C → назва. */
  productNameByCode: Map<string, string>;
  /** productId → назва категорії. */
  categoryByProductId: Map<string, string>;
  /** productCode1C → назва категорії. */
  categoryByProductCode: Map<string, string>;
  /** warehouseCode1C → назва складу. */
  warehouseNameByCode: Map<string, string>;
  /** quality (code1C) → назва якості. */
  qualityNameByCode: Map<string, string>;
}

/** Короткий хвіст hex, коли назву не вдалося резолвити. */
function short(h: string | null): string {
  return h ? `…${h.slice(-6)}` : "—";
}

// ─── Реєстр вимірів ─────────────────────────────────────────────────────────

export interface DimensionDef {
  key: string;
  label: string;
  resolve(m: FlexStockMovement, maps: StockMaps): { id: string; label: string };
}

export const DIMENSIONS: readonly DimensionDef[] = [
  {
    key: "product",
    label: "Товар",
    resolve(m, maps) {
      const name =
        (m.productId && maps.productNameById.get(m.productId)) ||
        (m.productCode1C && maps.productNameByCode.get(m.productCode1C)) ||
        null;
      const id = m.productId ?? m.productCode1C ?? "—";
      return { id, label: name ?? short(m.productCode1C) };
    },
  },
  {
    key: "category",
    label: "Категорія",
    resolve(m, maps) {
      const cat =
        (m.productId && maps.categoryByProductId.get(m.productId)) ||
        (m.productCode1C && maps.categoryByProductCode.get(m.productCode1C)) ||
        null;
      const label = cat ?? "Без категорії";
      return { id: label, label };
    },
  },
  {
    key: "warehouse",
    label: "Склад",
    resolve(m, maps) {
      const name = m.warehouseCode1C
        ? maps.warehouseNameByCode.get(m.warehouseCode1C)
        : null;
      // Склади можуть бути відсутні у довіднику — fallback на сам код.
      return {
        id: m.warehouseCode1C ?? "—",
        label:
          name ?? (m.warehouseCode1C ? short(m.warehouseCode1C) : "Без складу"),
      };
    },
  },
  {
    key: "quality",
    label: "Якість",
    resolve(m, maps) {
      const raw = m.quality?.trim() || null;
      if (!raw) return { id: "—", label: "—" };
      // Якість зберігається як hex(Качество) або вже як текст.
      const name = maps.qualityNameByCode.get(raw);
      return { id: raw, label: name ?? raw };
    },
  },
];

const DIMENSION_BY_KEY = new Map(DIMENSIONS.map((d) => [d.key, d]));

// ─── Реєстр показників ──────────────────────────────────────────────────────

export type IndicatorKind = "qty" | "weight";

export interface IndicatorDef {
  key: string;
  label: string;
  kind: IndicatorKind;
  /** Підписане значення показника для одного руху (− для розходу). */
  value(m: FlexStockMovement): number;
}

/** Знак за видом руху: прихід (+1, recordKind 0) / розхід (−1, recordKind 1). */
function sign(m: FlexStockMovement): number {
  return m.recordKind === 1 ? -1 : 1;
}

/** Прибирає JS-артефакт `-0` (від `−1 * 0`) → нормальний `0`. */
function noNegZero(n: number): number {
  return n === 0 ? 0 : n;
}

export const INDICATORS: readonly IndicatorDef[] = [
  {
    key: "qtyBalance",
    label: "К-сть",
    kind: "qty",
    value: (m) => noNegZero(sign(m) * m.qty),
  },
  {
    key: "weightBalanceKg",
    label: "Вага, кг",
    kind: "weight",
    value: (m) => noNegZero(sign(m) * (m.weightKg ?? 0)),
  },
];

const INDICATOR_BY_KEY = new Map(INDICATORS.map((i) => [i.key, i]));

// ─── Нормалізація руху → рядок ──────────────────────────────────────────────

/**
 * Перетворює сирий рух у нормалізований рядок (усі виміри + значення
 * показників). Знак уже застосований у `value()` (підписаний баланс), тож
 * агрегатор лише сумує.
 */
export function normalizeRow(
  m: FlexStockMovement,
  maps: StockMaps,
  indicators: string[],
): NormalizedRow {
  const dims: NormalizedRow["dims"] = {};
  for (const dim of DIMENSIONS) {
    dims[dim.key] = dim.resolve(m, maps);
  }
  const values: Record<string, number> = {};
  for (const k of indicators) {
    const def = INDICATOR_BY_KEY.get(k);
    values[k] = def ? def.value(m) : 0;
  }
  return { dims, values };
}

/** Округлення показника (qty/weight → 3dp). */
export function roundIndicator(_key: string, n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

// ─── Парс параметрів ────────────────────────────────────────────────────────

export const DEFAULT_GROUPS = ["category"];
export const DEFAULT_INDICATORS = ["qtyBalance", "weightBalanceKg"];
const MAX_GROUPS = 5;
/** Захист: без дати «станом на» і коли рухів > цього порогу — звіт не будуємо. */
const HARD_CAP = 200000;

/** Валідні ключі вимірів (CSV) → упорядкований унікальний список. */
function parseGroups(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_GROUPS];
  const out: string[] = [];
  for (const k of raw.split(",").map((s) => s.trim())) {
    if (DIMENSION_BY_KEY.has(k) && !out.includes(k)) out.push(k);
    if (out.length >= MAX_GROUPS) break;
  }
  return out.length ? out : [...DEFAULT_GROUPS];
}

/** Валідні ключі показників (CSV) → упорядкований унікальний список. */
function parseIndicators(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_INDICATORS];
  const out: string[] = [];
  for (const k of raw.split(",").map((s) => s.trim())) {
    if (INDICATOR_BY_KEY.has(k) && !out.includes(k)) out.push(k);
  }
  return out.length ? out : [...DEFAULT_INDICATORS];
}

/** Парсить дату `to`; залишок рахується до кінця цього дня включно. */
function parseAsOf(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ─── Результат + flat-shape ─────────────────────────────────────────────────

export interface StockFlexResult {
  groups: string[];
  indicators: string[];
  groupLabels: string[];
  indicatorDefs: { key: string; label: string; kind: IndicatorKind }[];
  tree: TreeNode[];
  grand: Record<string, number>;
  showTotals: boolean;
  rowCount: number;
  tooLarge: boolean;
}

/**
 * Async-білдер: читає рухи з Prisma (БЕЗ ліміту) до кінця дня `to`, резолвить
 * довідники у мапи, нормалізує, застосовує відбори, будує дерево балансу.
 */
export async function buildStockFlexReport(
  params: URLSearchParams,
): Promise<StockFlexResult> {
  const groups = parseGroups(params.get("groups"));
  const indicators = parseIndicators(params.get("ind"));
  const showTotals = params.get("totals") !== "0";
  // Баланс «станом на дату»: `from` ІГНОРУЄТЬСЯ.
  const asOf = parseAsOf(params.get("to"));

  // Відбори: f_<dimKey> = contains (case-insensitive) на резолвленому label.
  const filters: { dimKey: string; needle: string }[] = [];
  for (const dim of DIMENSIONS) {
    const v = params.get(`f_${dim.key}`);
    if (v && v.trim()) filters.push({ dimKey: dim.key, needle: v.trim() });
  }

  const where: Prisma.StockMovementWhereInput = {};
  if (asOf) {
    const end = new Date(asOf);
    end.setHours(23, 59, 59, 999);
    where.occurredAt = { lte: end };
  }

  const baseResult: StockFlexResult = {
    groups,
    indicators,
    groupLabels: groups.map((k) => DIMENSION_BY_KEY.get(k)?.label ?? k),
    indicatorDefs: indicators.map((k) => {
      const d = INDICATOR_BY_KEY.get(k)!;
      return { key: d.key, label: d.label, kind: d.kind };
    }),
    tree: [],
    grand: Object.fromEntries(indicators.map((k) => [k, 0])),
    showTotals,
    rowCount: 0,
    tooLarge: false,
  };

  // Захист від «усе за весь час» без дати «станом на».
  if (!asOf) {
    const count = await prisma.stockMovement.count({ where });
    if (count > HARD_CAP) {
      return { ...baseResult, rowCount: count, tooLarge: true };
    }
  }

  const movements = await prisma.stockMovement.findMany({
    where,
    select: {
      productCode1C: true,
      productId: true,
      warehouseCode1C: true,
      quality: true,
      qty: true,
      weightKg: true,
      recordKind: true,
    },
  });

  const lite: FlexStockMovement[] = movements.map((m) => ({
    productCode1C: m.productCode1C,
    productId: m.productId,
    warehouseCode1C: m.warehouseCode1C,
    quality: m.quality,
    qty: Number(m.qty),
    weightKg: m.weightKg == null ? null : Number(m.weightKg),
    recordKind: m.recordKind,
  }));

  const maps = await resolveMaps(lite);

  let rows = lite.map((m) => normalizeRow(m, maps, indicators));

  // Відбори по резолвлених підписах.
  if (filters.length) {
    rows = rows.filter((r) =>
      filters.every((f) => {
        const label = r.dims[f.dimKey]?.label ?? "";
        return label.toLowerCase().includes(f.needle.toLowerCase());
      }),
    );
  }

  const tree = buildSalesTree(rows, groups, indicators);
  const grand = grandTotal(rows, indicators);

  return { ...baseResult, tree, grand, rowCount: rows.length };
}

/** Батч-резолв усіх довідників, на які посилаються рухи. */
async function resolveMaps(movements: FlexStockMovement[]): Promise<StockMaps> {
  const productIds = [
    ...new Set(movements.map((m) => m.productId).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const warehouseCodes = [
    ...new Set(movements.map((m) => m.warehouseCode1C).filter(Boolean)),
  ] as string[];
  const qualityCodes = [
    ...new Set(movements.map((m) => m.quality?.trim() || null).filter(Boolean)),
  ] as string[];

  const [productsById, productsByCode, warehouses, qualities] =
    await Promise.all([
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              name: true,
              category: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      productCodes.length
        ? prisma.product.findMany({
            where: { code1C: { in: productCodes } },
            select: {
              code1C: true,
              name: true,
              category: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      warehouseCodes.length
        ? prisma.warehouse.findMany({
            where: { code1C: { in: warehouseCodes } },
            select: { code1C: true, name: true },
          })
        : Promise.resolve([]),
      qualityCodes.length
        ? prisma.quality.findMany({
            where: { code1C: { in: qualityCodes } },
            select: { code1C: true, name: true },
          })
        : Promise.resolve([]),
    ]);

  const productNameById = new Map<string, string>();
  const categoryByProductId = new Map<string, string>();
  for (const p of productsById) {
    productNameById.set(p.id, p.name);
    if (p.category?.name) categoryByProductId.set(p.id, p.category.name);
  }

  const productNameByCode = new Map<string, string>();
  const categoryByProductCode = new Map<string, string>();
  for (const p of productsByCode) {
    if (!p.code1C) continue;
    productNameByCode.set(p.code1C, p.name);
    if (p.category?.name) categoryByProductCode.set(p.code1C, p.category.name);
  }

  return {
    productNameById,
    productNameByCode,
    categoryByProductId,
    categoryByProductCode,
    warehouseNameByCode: new Map(
      warehouses.map((w) => [w.code1C ?? "", w.name] as const),
    ),
    qualityNameByCode: new Map(
      qualities.map((q) => [q.code1C ?? "", q.name] as const),
    ),
  };
}

// ─── Flat-shape для CSV/XLSX ────────────────────────────────────────────────

/**
 * Сплющує дерево у `ReportShape` (headers + rows) для generic CSV/XLSX-роутів.
 * Перша колонка — «Групування» з відступами за рівнем; далі — показники.
 * Останній рядок — «Разом» (якщо showTotals).
 */
export function flattenToReportShape(result: StockFlexResult): ReportShape {
  const headers = ["Групування", ...result.indicatorDefs.map((d) => d.label)];

  const rows: ReportShape["rows"] = [];

  function walk(nodes: TreeNode[]) {
    for (const n of nodes) {
      const indent = "    ".repeat(n.level);
      rows.push([
        `${indent}${n.label}`,
        ...result.indicators.map((k) => n.values[k] ?? 0),
      ]);
      if (n.children.length) walk(n.children);
    }
  }
  walk(result.tree);

  if (result.showTotals) {
    rows.push(["Разом", ...result.indicators.map((k) => result.grand[k] ?? 0)]);
  }

  const now = new Date();
  return {
    title: "Залишки складу",
    period: { from: now, to: now, label: "Станом на дату" },
    headers,
    rows,
  };
}
