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
import {
  parseFilters,
  applyRowFilters,
  collectFilterOptions,
} from "@/lib/reports/flex-filters";
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

/** Атрибути товару для довідкових колонок (стиль 1С «Остатки товаров»). */
export interface ProductAttrs {
  article: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  saleEur: number | null;
  akciyaEur: number | null;
  purchaseEur: number | null;
}

/** Резолвлені довідники (мапи code/id → людська назва). */
export interface StockMaps {
  /** productId → назва. */
  productNameById: Map<string, string>;
  /** productCode1C → назва. */
  productNameByCode: Map<string, string>;
  /** productId → артикул. */
  articleByProductId: Map<string, string>;
  /** productCode1C → артикул. */
  articleByProductCode: Map<string, string>;
  /** productId → назва категорії. */
  categoryByProductId: Map<string, string>;
  /** productCode1C → назва категорії. */
  categoryByProductCode: Map<string, string>;
  /** warehouseCode1C → назва складу. */
  warehouseNameByCode: Map<string, string>;
  /** quality (code1C) → назва якості. */
  qualityNameByCode: Map<string, string>;
  /** product-ключ (productId ?? code1C) → атрибути товару (для колонок). */
  attrsByProductKey: Map<string, ProductAttrs>;
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
    label: "Найменування",
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
    key: "article",
    label: "Артикул",
    resolve(m, maps) {
      const article =
        (m.productId && maps.articleByProductId.get(m.productId)) ||
        (m.productCode1C && maps.articleByProductCode.get(m.productCode1C)) ||
        null;
      // id — на рівні товару (productId/код), щоб вузол лишався product-level.
      const id = m.productId ?? m.productCode1C ?? "—";
      return { id, label: article || "—" };
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

// ─── Реєстр довідкових колонок (стиль 1С «Остатки товаров») ──────────────────

export type AttrKind = "text" | "money" | "qty";

export interface AttrColumnDef {
  key: string;
  label: string;
  kind: AttrKind;
  /** Значення з атрибутів товару (null/«» коли немає). */
  value(a: ProductAttrs): string | number | null;
}

/**
 * Довідкові колонки товару. Показуються лише на product-leaf рядках (де
 * піддерево відповідає одному товару). НЕ сумуються деревом.
 */
export const ATTR_COLUMNS: readonly AttrColumnDef[] = [
  { key: "article", label: "Артикул", kind: "text", value: (a) => a.article },
  { key: "name", label: "Найменування", kind: "text", value: (a) => a.name },
  {
    key: "description",
    label: "Опис",
    kind: "text",
    value: (a) => a.description,
  },
  {
    key: "category",
    label: "Категорія",
    kind: "text",
    value: (a) => a.category,
  },
  {
    key: "saleEur",
    label: "Ціна продажу",
    kind: "money",
    value: (a) => a.saleEur,
  },
  {
    key: "akciyaEur",
    label: "Ціна акція",
    kind: "money",
    value: (a) => a.akciyaEur,
  },
  {
    key: "purchaseEur",
    label: "Ціна закупки",
    kind: "money",
    value: (a) => a.purchaseEur,
  },
];

const ATTR_BY_KEY = new Map(ATTR_COLUMNS.map((c) => [c.key, c]));

/** Дефолтні довідкові колонки (легкий набір). */
export const DEFAULT_ATTRS = ["article", "name", "category", "saleEur"];

/** Валідні ключі колонок (CSV) → упорядкований унікальний список. */
function parseAttrCols(raw: string | null): string[] {
  if (raw == null) return [...DEFAULT_ATTRS];
  const out: string[] = [];
  for (const k of raw.split(",").map((s) => s.trim())) {
    if (ATTR_BY_KEY.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

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

/** Ключ товару (productId, інакше код1С) — стабільний на рівні товару. */
export function productKeyOf(m: FlexStockMovement): string {
  return m.productId ?? m.productCode1C ?? "—";
}

/**
 * Post-pass: проставляє `node.attrs` на вузлах, піддерево яких відповідає
 * РІВНО ОДНОМУ товару. Для цього зіставляємо рядки з вузлами за тим самим
 * `dims[group].id`-шляхом, що його будує `buildSalesTree`, і збираємо множину
 * productKey під кожним вузлом. Коли множина = 1 елемент і ми маємо для нього
 * атрибути — заповнюємо.
 */
export function attachProductAttrs(
  nodes: TreeNode[],
  rows: NormalizedRow[],
  productKeys: string[],
  groups: string[],
  selectedCols: string[],
  attrsByKey: Map<string, ProductAttrs>,
): void {
  if (!selectedCols.length || !groups.length) return;
  const cols = selectedCols
    .map((k) => ATTR_BY_KEY.get(k))
    .filter((c): c is AttrColumnDef => Boolean(c));
  if (!cols.length) return;

  // indices у `rows`, що належать поточному піддереву.
  function walk(node: TreeNode, idxs: number[], level: number) {
    const dimKey = groups[level]!;
    const id = node.key.slice(dimKey.length + 1); // "dimKey:id" → "id"
    const subset = idxs.filter(
      (i) => (rows[i]!.dims[dimKey]?.id ?? "—") === id,
    );

    const distinct = new Set<string>();
    for (const i of subset) {
      distinct.add(productKeys[i]!);
      if (distinct.size > 1) break;
    }
    if (distinct.size === 1) {
      const [key] = [...distinct];
      const a = key ? attrsByKey.get(key) : undefined;
      if (a) {
        const attrs: Record<string, string | number | null> = {};
        for (const c of cols) attrs[c.key] = c.value(a);
        node.attrs = attrs;
      }
    }

    if (node.children.length) {
      for (const child of node.children) walk(child, subset, level + 1);
    }
  }

  const allIdx = rows.map((_, i) => i);
  for (const n of nodes) walk(n, allIdx, 0);
}

// ─── Парс параметрів ────────────────────────────────────────────────────────

export const DEFAULT_GROUPS = ["category"];
// Дефолт — лише К-сть. «Вага, кг» опційна: ваговий регістр _AccumRg6608 фіксує
// переважно вибуття (розхід), тож ваговий БАЛАНС ненадійний — вмикати свідомо.
export const DEFAULT_INDICATORS = ["qtyBalance"];
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
  /** Обрані довідкові колонки товару (для FlexTree + CSV/XLSX). */
  attrCols: string[];
  attrColDefs: { key: string; label: string; kind: AttrKind }[];
  tree: TreeNode[];
  grand: Record<string, number>;
  showTotals: boolean;
  rowCount: number;
  tooLarge: boolean;
  /** Відсортовані distinct-значення на вимір (для combobox-відборів). */
  filterOptions: Record<string, string[]>;
}

/** Усі ключі вимірів — фільтрабельні. */
const FILTERABLE_DIMS = DIMENSIONS.map((d) => d.key);
const getRowLabel = (r: NormalizedRow, dim: string) => r.dims[dim]?.label ?? "";

/**
 * Async-білдер: читає рухи з Prisma (БЕЗ ліміту) до кінця дня `to`, резолвить
 * довідники у мапи, нормалізує, застосовує відбори, будує дерево балансу.
 */
export async function buildStockFlexReport(
  params: URLSearchParams,
): Promise<StockFlexResult> {
  const groups = parseGroups(params.get("groups"));
  const indicators = parseIndicators(params.get("ind"));
  const attrCols = parseAttrCols(params.get("cols"));
  const showTotals = params.get("totals") !== "0";
  // Баланс «станом на дату»: `from` ІГНОРУЄТЬСЯ.
  const asOf = parseAsOf(params.get("to"));

  // Відбори у стилі 1С: f_<dim> (значення) + fop_<dim> (вид порівняння).
  const filters = parseFilters(params, FILTERABLE_DIMS);

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
    attrCols,
    attrColDefs: attrCols.map((k) => {
      const c = ATTR_BY_KEY.get(k)!;
      return { key: c.key, label: c.label, kind: c.kind };
    }),
    tree: [],
    grand: Object.fromEntries(indicators.map((k) => [k, 0])),
    showTotals,
    rowCount: 0,
    tooLarge: false,
    filterOptions: {},
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

  // Виключаємо НЕ-каталожні товари (яких немає у довіднику Product) — це службові/
  // витратні позиції 1С (напр. паливо), що мають лише розхід і засмічують баланс
  // великим мінусом. `?showUnknown=1` повертає їх у звіт.
  const showUnknown = params.get("showUnknown") === "1";
  const liteCat = showUnknown
    ? lite
    : lite.filter(
        (m) =>
          (m.productId && maps.productNameById.has(m.productId)) ||
          (m.productCode1C && maps.productNameByCode.has(m.productCode1C)),
      );

  // Зберігаємо productKey синхронно з рядками (для post-pass атрибутів).
  const pairedAll = liteCat.map((m) => ({
    row: normalizeRow(m, maps, indicators),
    productKey: productKeyOf(m),
  }));

  // Значення відборів — з УСІХ рядків ДО застосування фільтрів.
  const filterOptions = collectFilterOptions(
    pairedAll.map((p) => p.row),
    FILTERABLE_DIMS,
    getRowLabel,
  );

  // Відбори по резолвлених підписах (фільтруємо пари, щоб зберегти productKey).
  const keep = new Set(
    applyRowFilters(
      pairedAll.map((p) => p.row),
      filters,
      getRowLabel,
    ),
  );
  const paired = filters.length
    ? pairedAll.filter((p) => keep.has(p.row))
    : pairedAll;

  const rows = paired.map((p) => p.row);
  const productKeys = paired.map((p) => p.productKey);

  const tree = buildSalesTree(rows, groups, indicators);
  const grand = grandTotal(rows, indicators);

  // Довідкові колонки — на вузлах, що відповідають одному товару.
  attachProductAttrs(
    tree,
    rows,
    productKeys,
    groups,
    attrCols,
    maps.attrsByProductKey,
  );

  return { ...baseResult, tree, grand, rowCount: rows.length, filterOptions };
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

  const productSelect = {
    id: true,
    code1C: true,
    name: true,
    articleCode: true,
    description: true,
    category: { select: { name: true } },
  } as const;

  const [productsById, productsByCode, warehouses, qualities] =
    await Promise.all([
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: productSelect,
          })
        : Promise.resolve([]),
      productCodes.length
        ? prisma.product.findMany({
            where: { code1C: { in: productCodes } },
            select: productSelect,
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

  // Об'єднаний реєстр усіх знайдених товарів за обома ключами (id + code1C).
  type ProductRow = (typeof productsById)[number];
  const productById = new Map<string, ProductRow>();
  const productByCode = new Map<string, ProductRow>();
  for (const p of [...productsById, ...productsByCode]) {
    productById.set(p.id, p);
    if (p.code1C) productByCode.set(p.code1C, p);
  }
  const allProductDbIds = [...new Set([...productById.keys()])];

  // Ціни (опт/акція, поточна/остання) + ціна закупки — батчем по productId.
  const [prices, purchasePrices, lots] = await Promise.all([
    allProductDbIds.length
      ? prisma.price.findMany({
          where: { productId: { in: allProductDbIds } },
          select: {
            productId: true,
            priceType: true,
            amount: true,
            validFrom: true,
          },
          orderBy: { validFrom: "desc" },
        })
      : Promise.resolve([]),
    allProductDbIds.length
      ? prisma.purchasePrice.findMany({
          where: { productId: { in: allProductDbIds } },
          select: { productId: true, priceEur: true, validFrom: true },
          orderBy: { validFrom: "desc" },
        })
      : Promise.resolve([]),
    allProductDbIds.length
      ? prisma.lot.findMany({
          where: {
            productId: { in: allProductDbIds },
            purchasePriceEur: { not: null },
          },
          select: { productId: true, purchasePriceEur: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  // Остання (найсвіжіша) ціна за типом → productId.
  const saleByProductId = new Map<string, number>();
  const akciyaByProductId = new Map<string, number>();
  for (const pr of prices) {
    if (pr.priceType === "wholesale" && !saleByProductId.has(pr.productId)) {
      saleByProductId.set(pr.productId, pr.amount);
    } else if (
      pr.priceType === "akciya" &&
      !akciyaByProductId.has(pr.productId)
    ) {
      akciyaByProductId.set(pr.productId, pr.amount);
    }
  }
  // Ціна закупки: остання PurchasePrice, інакше остання Lot.purchasePriceEur.
  const purchaseByProductId = new Map<string, number>();
  for (const pp of purchasePrices) {
    if (!purchaseByProductId.has(pp.productId)) {
      purchaseByProductId.set(pp.productId, pp.priceEur);
    }
  }
  for (const l of lots) {
    if (l.purchasePriceEur != null && !purchaseByProductId.has(l.productId)) {
      purchaseByProductId.set(l.productId, l.purchasePriceEur);
    }
  }

  const productNameById = new Map<string, string>();
  const categoryByProductId = new Map<string, string>();
  const articleByProductId = new Map<string, string>();
  for (const p of productsById) {
    productNameById.set(p.id, p.name);
    if (p.category?.name) categoryByProductId.set(p.id, p.category.name);
    if (p.articleCode) articleByProductId.set(p.id, p.articleCode);
  }

  const productNameByCode = new Map<string, string>();
  const categoryByProductCode = new Map<string, string>();
  const articleByProductCode = new Map<string, string>();
  for (const p of productsByCode) {
    if (!p.code1C) continue;
    productNameByCode.set(p.code1C, p.name);
    if (p.category?.name) categoryByProductCode.set(p.code1C, p.category.name);
    if (p.articleCode) articleByProductCode.set(p.code1C, p.articleCode);
  }

  // Атрибути за product-ключем (productId ?? code1C) — як у `productKeyOf`.
  const attrsByProductKey = new Map<string, ProductAttrs>();
  for (const p of [...productById.values(), ...productByCode.values()]) {
    const attrs: ProductAttrs = {
      article: p.articleCode ?? null,
      name: p.name ?? null,
      description: p.description?.trim() ? p.description : null,
      category: p.category?.name ?? null,
      saleEur: saleByProductId.get(p.id) ?? null,
      akciyaEur: akciyaByProductId.get(p.id) ?? null,
      purchaseEur: purchaseByProductId.get(p.id) ?? null,
    };
    // Рух може посилатись на товар або id, або code1C — кладемо за обома.
    attrsByProductKey.set(p.id, attrs);
    if (p.code1C) attrsByProductKey.set(p.code1C, attrs);
  }

  return {
    productNameById,
    productNameByCode,
    articleByProductId,
    articleByProductCode,
    categoryByProductId,
    categoryByProductCode,
    warehouseNameByCode: new Map(
      warehouses.map((w) => [w.code1C ?? "", w.name] as const),
    ),
    qualityNameByCode: new Map(
      qualities.map((q) => [q.code1C ?? "", q.name] as const),
    ),
    attrsByProductKey,
  };
}

// ─── Flat-shape для CSV/XLSX ────────────────────────────────────────────────

/**
 * Сплющує дерево у `ReportShape` (headers + rows) для generic CSV/XLSX-роутів.
 * Перша колонка — «Групування» з відступами за рівнем; далі — показники.
 * Останній рядок — «Разом» (якщо showTotals).
 */
export function flattenToReportShape(result: StockFlexResult): ReportShape {
  const headers = [
    "Групування",
    ...result.indicatorDefs.map((d) => d.label),
    ...result.attrColDefs.map((d) => d.label),
  ];

  const rows: ReportShape["rows"] = [];

  function attrCells(
    attrs: Record<string, string | number | null> | undefined,
  ): (string | number | null)[] {
    return result.attrCols.map((k) => attrs?.[k] ?? null);
  }

  function walk(nodes: TreeNode[]) {
    for (const n of nodes) {
      const indent = "    ".repeat(n.level);
      rows.push([
        `${indent}${n.label}`,
        ...result.indicators.map((k) => n.values[k] ?? 0),
        ...attrCells(n.attrs),
      ]);
      if (n.children.length) walk(n.children);
    }
  }
  walk(result.tree);

  if (result.showTotals) {
    rows.push([
      "Разом",
      ...result.indicators.map((k) => result.grand[k] ?? 0),
      ...result.attrCols.map(() => null),
    ]);
  }

  const now = new Date();
  return {
    title: "Залишки складу",
    period: { from: now, to: now, label: "Станом на дату" },
    headers,
    rows,
  };
}
