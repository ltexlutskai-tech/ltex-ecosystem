/**
 * Гнучкий (універсальний) звіт «Рух коштів (ДДС)» — аналог гнучких звітів
 * «Продажі» / «Маржа», але над регістром `CashFlowMovement`
 * (1С AccumRg ДвиженияДенежныхСредств).
 *
 * Архітектура (повторює `sales-flex.ts`):
 *   1. Реєстр ВИМІРІВ (`DIMENSIONS`) — кожен резолвить рух → {id, label}:
 *      стаття / рахунок (каса) / контрагент / напрям / рік / місяць.
 *   2. Реєстр ПОКАЗНИКІВ (`INDICATORS`) — усі грошові (summable), розщеплені за
 *      напрямом руху: прихід / розхід / сальдо у ₴ та €.
 *   3. Чиста нормалізація руху → рядок + спільне дерево `buildSalesTree`.
 *   4. Async-білдер `buildCashflowFlexReport(params)` — читає рухи з Prisma (БЕЗ
 *      ліміту), батч-резолвить довідники у мапи, нормалізує, відбирає, будує
 *      дерево.
 *
 * Знак НЕ застосовується агрегатором: показники самі обчислюють прихід/розхід за
 * полем `direction` (0=Прихід / 1=Розхід), тож сумування деревом коректне.
 */

import { prisma, Prisma } from "@ltex/db";
import { buildOccurredAtFilter } from "@/lib/manager/registry-view";
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
export interface FlexCashFlowMovement {
  occurredAt: Date;
  articleCode1C: string | null;
  accountCode1C: string | null;
  clientCode1C: string | null;
  direction: number; // 0=Прихід / 1=Розхід
  amountUah: number;
  amountUpr: number | null; // СуммаУпр (EUR)
}

/** Резолвлені довідники (мапи code1C → людська назва). */
export interface CashFlowMaps {
  /** articleCode1C → назва статті. */
  articleNameByCode: Map<string, string>;
  /** articleCode1C → назва безпосередньої папки-категорії (підкатегорія). */
  articleParentByCode: Map<string, string>;
  /** articleCode1C → назва кореневої папки-категорії (верхній рівень). */
  articleRootByCode: Map<string, string>;
  /** accountCode1C → назва рахунку/каси. */
  accountNameByCode: Map<string, string>;
  /** clientCode1C (uid1C) → назва контрагента. */
  clientNameByCode: Map<string, string>;
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
  resolve(
    m: FlexCashFlowMovement,
    maps: CashFlowMaps,
  ): { id: string; label: string };
}

export const DIMENSIONS: readonly DimensionDef[] = [
  {
    key: "article",
    label: "Стаття",
    resolve(m, maps) {
      const name = m.articleCode1C
        ? maps.articleNameByCode.get(m.articleCode1C)
        : null;
      return { id: m.articleCode1C ?? "—", label: name ?? "Без статті" };
    },
  },
  {
    key: "articleRoot",
    label: "Категорія статті",
    resolve(m, maps) {
      const root = m.articleCode1C
        ? maps.articleRootByCode.get(m.articleCode1C)
        : null;
      const label = root ?? "Без категорії";
      return { id: label, label };
    },
  },
  {
    key: "articleGroup",
    label: "Підкатегорія статті",
    resolve(m, maps) {
      const parent = m.articleCode1C
        ? maps.articleParentByCode.get(m.articleCode1C)
        : null;
      const label = parent ?? "Без категорії";
      return { id: label, label };
    },
  },
  {
    key: "account",
    label: "Рахунок / Каса",
    resolve(m, maps) {
      const name = m.accountCode1C
        ? maps.accountNameByCode.get(m.accountCode1C)
        : null;
      // Каси можуть бути відсутні у довіднику — fallback на сам код.
      return {
        id: m.accountCode1C ?? "—",
        label: name ?? short(m.accountCode1C),
      };
    },
  },
  {
    key: "client",
    label: "Контрагент",
    resolve(m, maps) {
      const name = m.clientCode1C
        ? maps.clientNameByCode.get(m.clientCode1C)
        : null;
      return { id: m.clientCode1C ?? "—", label: name ?? "—" };
    },
  },
  {
    key: "direction",
    label: "Напрям",
    resolve(m) {
      const id = m.direction === 1 ? "1" : "0";
      return { id, label: id === "1" ? "Розхід" : "Прихід" };
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

export type IndicatorKind = "money";

export interface IndicatorDef {
  key: string;
  label: string;
  kind: IndicatorKind;
  /** Значення показника для одного руху (за напрямом руху, БЕЗ знаку зверху). */
  value(m: FlexCashFlowMovement): number;
}

/** Сума € руху (СуммаУпр), 0 коли відсутня. */
function eur(m: FlexCashFlowMovement): number {
  return m.amountUpr ?? 0;
}

export const INDICATORS: readonly IndicatorDef[] = [
  {
    key: "inflowUah",
    label: "Прихід, ₴",
    kind: "money",
    value: (m) => (m.direction === 0 ? m.amountUah : 0),
  },
  {
    key: "outflowUah",
    label: "Розхід, ₴",
    kind: "money",
    value: (m) => (m.direction === 1 ? m.amountUah : 0),
  },
  {
    key: "netUah",
    label: "Сальдо, ₴",
    kind: "money",
    value: (m) =>
      (m.direction === 0 ? m.amountUah : 0) -
      (m.direction === 1 ? m.amountUah : 0),
  },
  {
    key: "inflowEur",
    label: "Прихід, €",
    kind: "money",
    value: (m) => (m.direction === 0 ? eur(m) : 0),
  },
  {
    key: "outflowEur",
    label: "Розхід, €",
    kind: "money",
    value: (m) => (m.direction === 1 ? eur(m) : 0),
  },
  {
    key: "netEur",
    label: "Сальдо, €",
    kind: "money",
    value: (m) =>
      (m.direction === 0 ? eur(m) : 0) - (m.direction === 1 ? eur(m) : 0),
  },
];

const INDICATOR_BY_KEY = new Map(INDICATORS.map((i) => [i.key, i]));

// ─── Нормалізація руху → рядок ──────────────────────────────────────────────

/**
 * Перетворює сирий рух у нормалізований рядок (усі виміри + значення
 * показників). Знак НЕ застосовується — показники самі обчислюють прихід/розхід.
 */
export function normalizeRow(
  m: FlexCashFlowMovement,
  maps: CashFlowMaps,
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

/** Округлення показника (усі ДДС-показники грошові → 2dp). */
export function roundIndicator(_key: string, n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── Парс параметрів ────────────────────────────────────────────────────────

export const DEFAULT_GROUPS = ["article"];
export const DEFAULT_INDICATORS = ["inflowUah", "outflowUah", "netUah"];
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

export interface CashflowFlexResult {
  groups: string[];
  indicators: string[];
  groupLabels: string[];
  indicatorDefs: { key: string; label: string; kind: IndicatorKind }[];
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
 * Async-білдер: читає рухи з Prisma (БЕЗ ліміту), резолвить довідники у мапи,
 * нормалізує, застосовує відбори, будує дерево.
 */
export async function buildCashflowFlexReport(
  params: URLSearchParams,
): Promise<CashflowFlexResult> {
  const groups = parseGroups(params.get("groups"));
  const indicators = parseIndicators(params.get("ind"));
  const showTotals = params.get("totals") !== "0";
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;

  // Відбори у стилі 1С: f_<dim> (значення) + fop_<dim> (вид порівняння).
  const filters = parseFilters(params, FILTERABLE_DIMS);

  const where: Prisma.CashFlowMovementWhereInput = {};
  const occurredAt = buildOccurredAtFilter(from, to);
  if (occurredAt) where.occurredAt = occurredAt;

  const baseResult: CashflowFlexResult = {
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
    filterOptions: {},
  };

  // Захист від «усе за весь час» без періоду.
  if (!occurredAt) {
    const count = await prisma.cashFlowMovement.count({ where });
    if (count > HARD_CAP) {
      return { ...baseResult, rowCount: count, tooLarge: true };
    }
  }

  const movements = await prisma.cashFlowMovement.findMany({
    where,
    select: {
      occurredAt: true,
      articleCode1C: true,
      accountCode1C: true,
      clientCode1C: true,
      direction: true,
      amountUah: true,
      amountUpr: true,
    },
  });

  const lite: FlexCashFlowMovement[] = movements.map((m) => ({
    occurredAt: m.occurredAt,
    articleCode1C: m.articleCode1C,
    accountCode1C: m.accountCode1C,
    clientCode1C: m.clientCode1C,
    direction: m.direction,
    amountUah: Number(m.amountUah),
    amountUpr: m.amountUpr == null ? null : Number(m.amountUpr),
  }));

  const maps = await resolveMaps(lite);

  const allRows = lite.map((m) => normalizeRow(m, maps, indicators));

  // Значення відборів — з УСІХ рядків ДО застосування фільтрів.
  const filterOptions = collectFilterOptions(
    allRows,
    FILTERABLE_DIMS,
    getRowLabel,
  );

  // Відбори по резолвлених підписах.
  const rows = applyRowFilters(allRows, filters, getRowLabel);

  const tree = buildSalesTree(rows, groups, indicators);
  const grand = grandTotal(rows, indicators);

  return { ...baseResult, tree, grand, rowCount: rows.length, filterOptions };
}

/** Батч-резолв усіх довідників, на які посилаються рухи. */
async function resolveMaps(
  movements: FlexCashFlowMovement[],
): Promise<CashFlowMaps> {
  const accountCodes = [
    ...new Set(movements.map((m) => m.accountCode1C).filter(Boolean)),
  ] as string[];
  const clientCodes = [
    ...new Set(movements.map((m) => m.clientCode1C).filter(Boolean)),
  ] as string[];

  const [allArticles, accounts, clients] = await Promise.all([
    // Весь довідник статей (з parentId) — для назв + ієрархії категорій.
    // Довідник малий (десятки-сотні рядків), тож тягнемо повністю.
    prisma.mgrCashFlowArticle.findMany({
      select: { id: true, code1C: true, name: true, parentId: true },
    }),
    accountCodes.length
      ? prisma.mgrBankAccount.findMany({
          where: { code1C: { in: accountCodes } },
          select: { code1C: true, name: true },
        })
      : Promise.resolve([]),
    clientCodes.length
      ? prisma.mgrClient.findMany({
          where: { uid1C: { in: clientCodes } },
          select: { uid1C: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const articleById = new Map(allArticles.map((a) => [a.id, a]));
  const articleNameByCode = new Map<string, string>();
  const articleParentByCode = new Map<string, string>();
  const articleRootByCode = new Map<string, string>();
  for (const a of allArticles) {
    if (!a.code1C) continue;
    articleNameByCode.set(a.code1C, a.name);
    // Безпосередня папка-категорія.
    const parent = a.parentId ? articleById.get(a.parentId) : undefined;
    articleParentByCode.set(a.code1C, parent?.name ?? "Без категорії");
    // Коренева папка (підіймаємось до верху; захист від циклів).
    let cur = parent;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = articleById.get(cur.parentId);
    }
    articleRootByCode.set(
      a.code1C,
      cur?.name ?? parent?.name ?? "Без категорії",
    );
  }

  return {
    articleNameByCode,
    articleParentByCode,
    articleRootByCode,
    accountNameByCode: new Map(
      accounts.map((a) => [a.code1C ?? "", a.name] as const),
    ),
    clientNameByCode: new Map(
      clients.map((c) => [c.uid1C ?? "", c.name] as const),
    ),
  };
}

// ─── Flat-shape для CSV/XLSX ────────────────────────────────────────────────

/**
 * Сплющує дерево у `ReportShape` (headers + rows) для generic CSV/XLSX-роутів.
 * Перша колонка — «Групування» з відступами за рівнем; далі — показники.
 * Останній рядок — «Разом» (якщо showTotals).
 */
export function flattenToReportShape(result: CashflowFlexResult): ReportShape {
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
    title: "Рух коштів (ДДС)",
    period: { from: now, to: now, label: "За обраний період" },
    headers,
    rows,
  };
}
