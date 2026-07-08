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
  amountUah: number; // Сумма (у валюті рахунку/каси)
  amountUpr: number | null; // СуммаУпр (EUR, управл. облік)
  currencyCode: "UAH" | "EUR" | "USD"; // валюта рахунку/каси (default UAH)
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
export type IndicatorCurrency = "uah" | "eur" | "usd";

export interface IndicatorDef {
  key: string;
  label: string;
  kind: IndicatorKind;
  /** Валюта колонки — керує символом ₴/€/$ у дереві. */
  currency: IndicatorCurrency;
  /** Значення показника для одного руху (за напрямом руху, БЕЗ знаку зверху). */
  value(m: FlexCashFlowMovement): number;
}

/** Сума € руху (СуммаУпр — управл. облік), 0 коли відсутня. */
function eur(m: FlexCashFlowMovement): number {
  return m.amountUpr ?? 0;
}

/**
 * Показники ДДС розкладені за валютою рахунку/каси:
 *   • грн / євро / долар — Сумма руху (`amountUah`) у ВЛАСНІЙ валюті рахунку
 *     (гейт по `currencyCode`), тож колонки не змішують валюти;
 *   • управлінський облік € — СуммаУпр (`amountUpr`), єдина валюта управління,
 *     сумується по ВСІХ рухах незалежно від валюти рахунку.
 * Кожна валюта має трійку Прихід / Розхід / Сальдо.
 */
const ACC_CURRENCIES: {
  code: "UAH" | "EUR" | "USD";
  cur: IndicatorCurrency;
  sym: string;
  suffix: string;
}[] = [
  { code: "UAH", cur: "uah", sym: "₴", suffix: "Uah" },
  { code: "EUR", cur: "eur", sym: "€", suffix: "EurAcc" },
  { code: "USD", cur: "usd", sym: "$", suffix: "UsdAcc" },
];

/** Сумма руху, якщо його валюта = задана (інакше 0). */
function amt(m: FlexCashFlowMovement, code: "UAH" | "EUR" | "USD"): number {
  return m.currencyCode === code ? m.amountUah : 0;
}

const CURRENCY_INDICATORS: IndicatorDef[] = ACC_CURRENCIES.flatMap((c) => [
  {
    key: `inflow${c.suffix}`,
    label: `Прихід, ${c.sym}`,
    kind: "money" as const,
    currency: c.cur,
    value: (m: FlexCashFlowMovement) =>
      m.direction === 0 ? amt(m, c.code) : 0,
  },
  {
    key: `outflow${c.suffix}`,
    label: `Розхід, ${c.sym}`,
    kind: "money" as const,
    currency: c.cur,
    value: (m: FlexCashFlowMovement) =>
      m.direction === 1 ? amt(m, c.code) : 0,
  },
  {
    key: `net${c.suffix}`,
    label: `Сальдо, ${c.sym}`,
    kind: "money" as const,
    currency: c.cur,
    value: (m: FlexCashFlowMovement) =>
      (m.direction === 0 ? amt(m, c.code) : 0) -
      (m.direction === 1 ? amt(m, c.code) : 0),
  },
]);

export const INDICATORS: readonly IndicatorDef[] = [
  ...CURRENCY_INDICATORS,
  // Управлінський облік (€) — СуммаУпр по всіх рухах.
  {
    key: "inflowUpr",
    label: "Прихід, упр. €",
    kind: "money",
    currency: "eur",
    value: (m) => (m.direction === 0 ? eur(m) : 0),
  },
  {
    key: "outflowUpr",
    label: "Розхід, упр. €",
    kind: "money",
    currency: "eur",
    value: (m) => (m.direction === 1 ? eur(m) : 0),
  },
  {
    key: "netUpr",
    label: "Сальдо, упр. €",
    kind: "money",
    currency: "eur",
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
// Легкий старт: Сальдо по кожній валюті + управлінський підсумок €.
export const DEFAULT_INDICATORS = [
  "netUah",
  "netEurAcc",
  "netUsdAcc",
  "netUpr",
];
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
  indicatorDefs: {
    key: string;
    label: string;
    kind: IndicatorKind;
    currency: IndicatorCurrency;
  }[];
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
      return { key: d.key, label: d.label, kind: d.kind, currency: d.currency };
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
      currencyCode: true,
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
    currencyCode:
      m.currencyCode === "EUR" || m.currencyCode === "USD"
        ? m.currencyCode
        : "UAH",
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
          // Нативні рухи пишуть `code1C ?? id`, історичні — hex(code1C).
          where: {
            OR: [
              { code1C: { in: accountCodes } },
              { id: { in: accountCodes } },
            ],
          },
          select: { id: true, code1C: true, name: true },
        })
      : Promise.resolve([]),
    clientCodes.length
      ? prisma.mgrClient.findMany({
          // Нативні рухи пишуть `Customer.code1C`, історичні — hex(Контрагент)=uid1C.
          where: {
            OR: [
              { uid1C: { in: clientCodes } },
              { code1C: { in: clientCodes } },
            ],
          },
          select: { uid1C: true, code1C: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const articleById = new Map(allArticles.map((a) => [a.id, a]));
  const articleNameByCode = new Map<string, string>();
  const articleParentByCode = new Map<string, string>();
  const articleRootByCode = new Map<string, string>();
  for (const a of allArticles) {
    // Безпосередня папка-категорія + коренева (підіймаємось до верху; захист
    // від циклів). Обчислюємо раз, реєструємо під code1C (1С) І під id (нативні).
    const parent = a.parentId ? articleById.get(a.parentId) : undefined;
    const parentName = parent?.name ?? "Без категорії";
    let cur = parent;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = articleById.get(cur.parentId);
    }
    const rootName = cur?.name ?? parent?.name ?? "Без категорії";

    const keys = a.code1C ? [a.code1C, a.id] : [a.id];
    for (const key of keys) {
      articleNameByCode.set(key, a.name);
      articleParentByCode.set(key, parentName);
      articleRootByCode.set(key, rootName);
    }
  }

  const accountNameByCode = new Map<string, string>();
  for (const a of accounts) {
    if (a.code1C) accountNameByCode.set(a.code1C, a.name);
    accountNameByCode.set(a.id, a.name);
  }
  // Сентинел готівкової каси (нативні готівкові ноги — Задача A).
  accountNameByCode.set("CASH", "Каса (готівка)");

  const clientNameByCode = new Map<string, string>();
  for (const c of clients) {
    if (c.uid1C) clientNameByCode.set(c.uid1C, c.name);
    if (c.code1C) clientNameByCode.set(c.code1C, c.name);
  }

  return {
    articleNameByCode,
    articleParentByCode,
    articleRootByCode,
    accountNameByCode,
    clientNameByCode,
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
