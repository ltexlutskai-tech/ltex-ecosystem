/**
 * Гнучкий (універсальний) звіт «Продажі» — аналог 1С-звіту «Продажи» з
 * довільним багаторівневим групуванням, набором показників та відборами.
 *
 * Будується над матеріалізованим регістром `SalesMovement` (1С AccumRg Продажи).
 *
 * Архітектура:
 *   1. Реєстр ВИМІРІВ (`DIMENSIONS`) — кожен резолвить рух → {id, label}.
 *   2. Реєстр ПОКАЗНИКІВ (`INDICATORS`) — qty / вага / виручка / знижка тощо.
 *   3. Чиста агрегація `buildSalesTree(rows, groups, indicators)` → дерево вузлів
 *      з підсумками = Σ нащадків (повністю юніт-тестується, без БД).
 *   4. Async-білдер `buildSalesFlexReport(params)` — читає рухи з Prisma (БЕЗ
 *      ліміту), батч-резолвить довідники у мапи, нормалізує рядки, застосовує
 *      відбори, будує дерево.
 *
 * Знак: recordKind===1 (Повернення) → −1 (зменшує оборот); 0 (Продаж) → +1.
 * (Узгоджено з `summarizeSales` у `registry-reports.ts`.)
 */

import { prisma, Prisma } from "@ltex/db";
import { buildOccurredAtFilter } from "@/lib/manager/registry-view";
import { formatOrderNumber, formatDocNumber } from "@/lib/manager/order-number";
import type { ReportShape } from "@/lib/reports/analyst-reports";

// ─── Сирий рух (lite-зріз для білдера) ──────────────────────────────────────

/** Поля руху + резолвлені довідники, потрібні для вимірів. */
export interface FlexSalesMovement {
  occurredAt: Date;
  productCode1C: string | null;
  productId: string | null;
  clientCode1C: string | null;
  clientId: string | null;
  orderCode1C: string | null;
  saleCode1C: string | null;
  recorderCode1C: string | null;
  qty: number;
  weightKg: number | null;
  revenueEur: number;
  revenueNoDiscountEur: number | null;
  recordKind: number;
}

/** Резолвлені довідники (мапи code/id → людська назва). */
export interface FlexMaps {
  /** clientId → дані клієнта. */
  clientById: Map<
    string,
    {
      name: string;
      region: string | null;
      city: string | null;
      agentName: string | null;
      categoryLabel: string | null;
      priceTypeLabel: string | null;
    }
  >;
  /** productId → назва. */
  productNameById: Map<string, string>;
  /** productCode1C → назва. */
  productNameByCode: Map<string, string>;
  /** orderCode1C → форматований номер. */
  orderNoByCode: Map<string, string>;
  /** saleCode1C / recorderCode1C → форматований номер документа продажу. */
  saleNoByCode: Map<string, string>;
}

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

/** Короткий хвіст hex, коли назву не вдалося резолвити. */
function short(h: string | null): string {
  return h ? `…${h.slice(-6)}` : "—";
}

// ─── Реєстр вимірів ─────────────────────────────────────────────────────────

export interface DimensionDef {
  key: string;
  label: string;
  resolve(m: FlexSalesMovement, maps: FlexMaps): { id: string; label: string };
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
    key: "client",
    label: "Клієнт",
    resolve(m, maps) {
      const c = m.clientId ? maps.clientById.get(m.clientId) : undefined;
      const id = m.clientId ?? m.clientCode1C ?? "—";
      return { id, label: c?.name ?? short(m.clientCode1C) };
    },
  },
  {
    key: "region",
    label: "Область",
    resolve(m, maps) {
      const c = m.clientId ? maps.clientById.get(m.clientId) : undefined;
      const region = c?.region?.trim() || null;
      return { id: region ?? "—", label: region ?? "Без області" };
    },
  },
  {
    key: "city",
    label: "Місто",
    resolve(m, maps) {
      const c = m.clientId ? maps.clientById.get(m.clientId) : undefined;
      const city = c?.city?.trim() || null;
      return { id: city ?? "—", label: city ?? "Без міста" };
    },
  },
  {
    key: "agent",
    label: "Торговий агент",
    resolve(m, maps) {
      // 1С: агент = Контрагент.ТорговийАгент → MgrClient.agentUserId → User.fullName.
      const c = m.clientId ? maps.clientById.get(m.clientId) : undefined;
      const agent = c?.agentName?.trim() || null;
      return { id: agent ?? "—", label: agent ?? "Без агента" };
    },
  },
  {
    key: "categoryTT",
    label: "Категорія ТТ",
    resolve(m, maps) {
      const c = m.clientId ? maps.clientById.get(m.clientId) : undefined;
      const cat = c?.categoryLabel?.trim() || null;
      return { id: cat ?? "—", label: cat ?? "Без категорії" };
    },
  },
  {
    key: "priceType",
    label: "Тип цін",
    resolve(m, maps) {
      const c = m.clientId ? maps.clientById.get(m.clientId) : undefined;
      const pt = c?.priceTypeLabel?.trim() || null;
      return { id: pt ?? "—", label: pt ?? "Без типу цін" };
    },
  },
  {
    key: "order",
    label: "Замовлення",
    resolve(m, maps) {
      const no = m.orderCode1C ? maps.orderNoByCode.get(m.orderCode1C) : null;
      const id = m.orderCode1C ?? "—";
      return { id, label: no ?? (m.orderCode1C ? short(m.orderCode1C) : "—") };
    },
  },
  {
    key: "saleDoc",
    label: "Документ продажу",
    resolve(m, maps) {
      const code = m.saleCode1C ?? m.recorderCode1C ?? null;
      const no = code ? maps.saleNoByCode.get(code) : null;
      return { id: code ?? "—", label: no ?? short(code) };
    },
  },
  {
    key: "year",
    label: "Рік",
    resolve(m) {
      const y = String(m.occurredAt.getFullYear());
      return { id: y, label: y };
    },
  },
  {
    key: "month",
    label: "Місяць",
    resolve(m) {
      const y = m.occurredAt.getFullYear();
      const mo = m.occurredAt.getMonth(); // 0-11
      const id = `${y}-${String(mo + 1).padStart(2, "0")}`;
      return { id, label: `${id} (${MONTH_NAMES[mo]})` };
    },
  },
];

const DIMENSION_BY_KEY = new Map(DIMENSIONS.map((d) => [d.key, d]));

// ─── Реєстр показників ──────────────────────────────────────────────────────

export type IndicatorKind = "money" | "qty" | "weight";

export interface IndicatorDef {
  key: string;
  label: string;
  kind: IndicatorKind;
  /** Значення показника для одного руху (БЕЗ знаку — знак додає агрегатор). */
  value(m: FlexSalesMovement): number;
}

export const INDICATORS: readonly IndicatorDef[] = [
  { key: "qty", label: "К-сть", kind: "qty", value: (m) => m.qty },
  {
    key: "weightKg",
    label: "Вага, кг",
    kind: "weight",
    value: (m) => m.weightKg ?? 0,
  },
  {
    key: "revenueEur",
    label: "Виручка, €",
    kind: "money",
    value: (m) => m.revenueEur,
  },
  {
    key: "revenueNoDiscountEur",
    label: "Виручка без знижок, €",
    kind: "money",
    value: (m) => m.revenueNoDiscountEur ?? m.revenueEur,
  },
  {
    key: "discountEur",
    label: "Знижка, €",
    kind: "money",
    // Знижка = СтоимостьБезСкидок − Стоимость.
    value: (m) => (m.revenueNoDiscountEur ?? m.revenueEur) - m.revenueEur,
  },
];

const INDICATOR_BY_KEY = new Map(INDICATORS.map((i) => [i.key, i]));

/** Знак за видом руху: продаж (+1) / повернення (−1). */
function sign(kind: number): number {
  return kind === 1 ? -1 : 1;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Округлення показника за його типом (money 2dp / qty,weight 3dp). */
export function roundIndicator(key: string, n: number): number {
  const def = INDICATOR_BY_KEY.get(key);
  return def?.kind === "money" ? round2(n) : round3(n);
}

// ─── Нормалізований рядок (для дерева) ──────────────────────────────────────

/** Рядок з обчисленими підписами вимірів та ЗНАКОВИМИ значеннями показників. */
export interface NormalizedRow {
  /** dimKey → { id, label }. */
  dims: Record<string, { id: string; label: string }>;
  /** indicatorKey → signed value. */
  values: Record<string, number>;
}

/** Вузол дерева підсумків. */
export interface TreeNode {
  key: string;
  label: string;
  level: number;
  values: Record<string, number>;
  children: TreeNode[];
}

/**
 * Будує дерево підсумків з нормалізованих рядків.
 *
 * @param rows       нормалізовані рядки (вже зі знаковими значеннями)
 * @param groups     упорядкований список ключів вимірів (рівні дерева)
 * @param indicators ключі показників, які агрегуються
 * @returns          масив вузлів верхнього рівня; кожен вузол має values = Σ
 *                   нащадків. Якщо groups порожній — повертає [] (підсумок
 *                   рахується окремо через `grandTotal`).
 */
export function buildSalesTree(
  rows: NormalizedRow[],
  groups: string[],
  indicators: string[],
): TreeNode[] {
  if (groups.length === 0) return [];

  function build(subset: NormalizedRow[], level: number): TreeNode[] {
    const dimKey = groups[level]!;
    const buckets = new Map<string, { label: string; rows: NormalizedRow[] }>();
    for (const r of subset) {
      const d = r.dims[dimKey] ?? { id: "—", label: "—" };
      let b = buckets.get(d.id);
      if (!b) {
        b = { label: d.label, rows: [] };
        buckets.set(d.id, b);
      }
      b.rows.push(r);
    }

    const nodes: TreeNode[] = [];
    for (const [id, bucket] of buckets) {
      const children =
        level + 1 < groups.length ? build(bucket.rows, level + 1) : [];
      const values = sumRows(bucket.rows, indicators);
      nodes.push({
        key: `${dimKey}:${id}`,
        label: bucket.label,
        level,
        values,
        children,
      });
    }
    // Сортування: за першим грошовим показником спадно, інакше за label.
    const sortKey =
      indicators.find((k) => INDICATOR_BY_KEY.get(k)?.kind === "money") ??
      indicators[0];
    nodes.sort((a, b) => {
      if (sortKey) {
        const diff = (b.values[sortKey] ?? 0) - (a.values[sortKey] ?? 0);
        if (diff !== 0) return diff;
      }
      return a.label.localeCompare(b.label, "uk");
    });
    return nodes;
  }

  return build(rows, 0);
}

/** Σ значень показників по набору рядків (із округленням). */
function sumRows(
  rows: NormalizedRow[],
  indicators: string[],
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const k of indicators) acc[k] = 0;
  for (const r of rows) {
    for (const k of indicators) acc[k] = (acc[k] ?? 0) + (r.values[k] ?? 0);
  }
  for (const k of indicators) acc[k] = roundIndicator(k, acc[k] ?? 0);
  return acc;
}

/** Загальний підсумок («Разом») по всіх рядках. */
export function grandTotal(
  rows: NormalizedRow[],
  indicators: string[],
): Record<string, number> {
  return sumRows(rows, indicators);
}

// ─── Нормалізація руху → рядок ──────────────────────────────────────────────

/** Перетворює сирий рух у нормалізований рядок (усі виміри + знакові показники). */
export function normalizeRow(
  m: FlexSalesMovement,
  maps: FlexMaps,
  indicators: string[],
): NormalizedRow {
  const s = sign(m.recordKind);
  const dims: NormalizedRow["dims"] = {};
  for (const dim of DIMENSIONS) {
    dims[dim.key] = dim.resolve(m, maps);
  }
  const values: Record<string, number> = {};
  for (const k of indicators) {
    const def = INDICATOR_BY_KEY.get(k);
    values[k] = def ? s * def.value(m) : 0;
  }
  return { dims, values };
}

// ─── Парс параметрів ────────────────────────────────────────────────────────

export const DEFAULT_GROUPS = ["client"];
export const DEFAULT_INDICATORS = ["qty", "weightKg", "revenueEur"];
const MAX_GROUPS = 5;
/** Захист: без періоду і коли рухів > цього порогу — звіт не будуємо. */
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

// ─── Результат + flat-shape ─────────────────────────────────────────────────

export interface SalesFlexResult {
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
 * Async-білдер: читає рухи з Prisma (БЕЗ ліміту), резолвить довідники у мапи,
 * нормалізує, застосовує відбори, будує дерево.
 */
export async function buildSalesFlexReport(
  params: URLSearchParams,
): Promise<SalesFlexResult> {
  const groups = parseGroups(params.get("groups"));
  const indicators = parseIndicators(params.get("ind"));
  const showTotals = params.get("totals") !== "0";
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  // Відбори: f_<dimKey> = contains (case-insensitive) на резолвленому label.
  const filters: { dimKey: string; needle: string }[] = [];
  for (const dim of DIMENSIONS) {
    const v = params.get(`f_${dim.key}`);
    if (v && v.trim()) filters.push({ dimKey: dim.key, needle: v.trim() });
  }

  const where: Prisma.SalesMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(from, to);
  if (occurredAt) where.occurredAt = occurredAt;

  const baseResult: SalesFlexResult = {
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

  // Захист від «усе за весь час» без періоду.
  if (!occurredAt) {
    const count = await prisma.salesMovement.count({ where });
    if (count > HARD_CAP) {
      return { ...baseResult, rowCount: count, tooLarge: true };
    }
  }

  const movements = await prisma.salesMovement.findMany({
    where,
    select: {
      occurredAt: true,
      productCode1C: true,
      productId: true,
      clientCode1C: true,
      clientId: true,
      orderCode1C: true,
      saleCode1C: true,
      recorderCode1C: true,
      qty: true,
      weightKg: true,
      revenueEur: true,
      revenueNoDiscountEur: true,
      recordKind: true,
    },
  });

  const lite: FlexSalesMovement[] = movements.map((m) => ({
    occurredAt: m.occurredAt,
    productCode1C: m.productCode1C,
    productId: m.productId,
    clientCode1C: m.clientCode1C,
    clientId: m.clientId,
    orderCode1C: m.orderCode1C,
    saleCode1C: m.saleCode1C,
    recorderCode1C: m.recorderCode1C,
    qty: Number(m.qty),
    weightKg: m.weightKg == null ? null : Number(m.weightKg),
    revenueEur: Number(m.revenueEur),
    revenueNoDiscountEur:
      m.revenueNoDiscountEur == null ? null : Number(m.revenueNoDiscountEur),
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
async function resolveMaps(movements: FlexSalesMovement[]): Promise<FlexMaps> {
  const clientIds = [
    ...new Set(movements.map((m) => m.clientId).filter(Boolean)),
  ] as string[];
  const productIds = [
    ...new Set(movements.map((m) => m.productId).filter(Boolean)),
  ] as string[];
  const productCodes = [
    ...new Set(movements.map((m) => m.productCode1C).filter(Boolean)),
  ] as string[];
  const orderCodes = [
    ...new Set(movements.map((m) => m.orderCode1C).filter(Boolean)),
  ] as string[];
  const saleCodes = [
    ...new Set(
      movements
        .flatMap((m) => [m.saleCode1C, m.recorderCode1C])
        .filter(Boolean),
    ),
  ] as string[];

  const [clients, productsById, productsByCode, orders, sales] =
    await Promise.all([
      clientIds.length
        ? prisma.mgrClient.findMany({
            where: { id: { in: clientIds } },
            select: {
              id: true,
              name: true,
              region: true,
              city: true,
              agent: { select: { fullName: true } },
              categoryTT: { select: { label: true } },
              priceType: { select: { label: true } },
            },
          })
        : Promise.resolve([]),
      productIds.length
        ? prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      productCodes.length
        ? prisma.product.findMany({
            where: { code1C: { in: productCodes } },
            select: { code1C: true, name: true },
          })
        : Promise.resolve([]),
      orderCodes.length
        ? prisma.order.findMany({
            where: { code1C: { in: orderCodes } },
            select: { code1C: true, number1C: true },
          })
        : Promise.resolve([]),
      saleCodes.length
        ? prisma.sale.findMany({
            where: { code1C: { in: saleCodes } },
            select: { code1C: true, number1C: true, docNumber: true },
          })
        : Promise.resolve([]),
    ]);

  return {
    clientById: new Map(
      clients.map((c) => [
        c.id,
        {
          name: c.name,
          region: c.region,
          city: c.city,
          agentName: c.agent?.fullName ?? null,
          categoryLabel: c.categoryTT?.label ?? null,
          priceTypeLabel: c.priceType?.label ?? null,
        },
      ]),
    ),
    productNameById: new Map(productsById.map((p) => [p.id, p.name])),
    productNameByCode: new Map(
      productsByCode.map((p) => [p.code1C ?? "", p.name] as const),
    ),
    orderNoByCode: new Map(
      orders.map((o) => [o.code1C ?? "", formatOrderNumber(o)] as const),
    ),
    saleNoByCode: new Map(
      sales.map((s) => [s.code1C ?? "", formatDocNumber(s)] as const),
    ),
  };
}

// ─── Flat-shape для CSV/XLSX ────────────────────────────────────────────────

/**
 * Сплющує дерево у `ReportShape` (headers + rows) для generic CSV/XLSX-роутів.
 * Перша колонка — «Групування» з відступами за рівнем; далі — показники.
 * Останній рядок — «Разом» (якщо showTotals).
 */
export function flattenToReportShape(result: SalesFlexResult): ReportShape {
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
    title: "Підсумок продажів",
    period: { from: now, to: now, label: "За обраний період" },
    headers,
    rows,
  };
}
