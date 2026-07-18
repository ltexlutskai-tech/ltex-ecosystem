import { prisma } from "@ltex/db";
import { getRegionLabel } from "@/lib/constants/regions";
import {
  buildProductGroupResolver,
  type ProductGroup,
} from "@/lib/manager/product-group";

/**
 * «Звіт менеджера» (ТЗ 2026-07-17) — початкова версія: загальні цифри по
 * виручці та тонажу з розбивкою по областях, клієнтах (ТТ) і групах товару
 * (Сток / Секонд хенд), + кількість ТТ що скупились, кількість нових ТТ і
 * порівняння з попереднім періодом (спрацювання ТТ: нові / втрачені).
 *
 * Архітектура як у решті звітів: ЧИСТА агрегація (`aggregatePeriod` /
 * `comparePeriods`) + тонкий async-лоадер (`getManagerSummary`), який тягне
 * реалізації (`Sale` status=posted) з позиціями і кличе чисті функції.
 *
 * Валюти: основна — ЄВРО (`Sale.totalEur`), ₴ (`Sale.totalUah`) показується
 * додатково. Розбивка по групах і план — у € (див. SalesPlan.planRevenueEur).
 */

/** Службовий slug загального (не по області) плану. */
export const TOTAL_PLAN_SLUG = "__total__";

// ─── Хелпери періоду (місяць) ────────────────────────────────────────────────

/** Валідує/нормалізує "YYYY-MM". Повертає null при невірному форматі. */
export function normalizeMonth(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/** "YYYY-MM" → межі місяця [from, to) в UTC. */
export function monthToRange(month: string): { from: Date; to: Date } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    from: new Date(Date.UTC(y, m - 1, 1)),
    to: new Date(Date.UTC(y, m, 1)),
  };
}

/** Зсув місяця на `delta` місяців (може бути відʼємним). "YYYY-MM". */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const EMPTY_GROUPS = (): Record<ProductGroup, GroupAgg> => ({
  stock: { revenueEur: 0, weightKg: 0 },
  second: { revenueEur: 0, weightKg: 0 },
  other: { revenueEur: 0, weightKg: 0 },
});

// ─── Вхідні рядки (плаский вигляд однієї реалізації) ─────────────────────────

export interface SaleRowGroups {
  stock: { revenueEur: number; weightKg: number };
  second: { revenueEur: number; weightKg: number };
  other: { revenueEur: number; weightKg: number };
}

export interface ManagerSaleRow {
  customerId: string;
  customerCode1C: string | null;
  customerName: string;
  regionSlug: string | null;
  totalUah: number;
  totalEur: number;
  weightKg: number;
  groups: SaleRowGroups;
}

// ─── Товарна агрегація (для вкладки «Товари») ────────────────────────────────

export interface ProductItemRow {
  productId: string;
  productName: string;
  articleCode: string | null;
  group: ProductGroup;
  revenueEur: number;
  weightKg: number;
  qty: number;
}

export interface ProductAgg {
  productId: string;
  productName: string;
  articleCode: string | null;
  group: ProductGroup;
  revenueEur: number;
  weightKg: number;
  qty: number;
}

// ─── Результати агрегації ────────────────────────────────────────────────────

export interface GroupAgg {
  revenueEur: number;
  weightKg: number;
}

export interface RegionAgg {
  regionSlug: string | null;
  regionLabel: string;
  revenueUah: number;
  revenueEur: number;
  weightKg: number;
  ttCount: number;
  newTtCount: number;
}

export interface ClientAgg {
  customerId: string;
  customerCode1C: string | null;
  /** MgrClient.id для лінка на картку клієнта (резолвиться лоадером). */
  mgrClientId: string | null;
  customerName: string;
  regionSlug: string | null;
  regionLabel: string;
  revenueUah: number;
  revenueEur: number;
  weightKg: number;
  isNew: boolean;
}

export interface PeriodAgg {
  revenueUah: number;
  revenueEur: number;
  weightKg: number;
  /** К-сть ТТ (унікальних клієнтів), що скупились у періоді. */
  ttCount: number;
  /** К-сть нових ТТ (перша в історії покупка припала на цей період). */
  newTtCount: number;
  groups: Record<ProductGroup, GroupAgg>;
  byRegion: RegionAgg[];
  byClient: ClientAgg[];
  /** Унікальні клієнти періоду — для порівняння (спрацювання). */
  customerIds: string[];
}

// ─── Чиста агрегація одного періоду ──────────────────────────────────────────

function regionLabelFor(slug: string | null): string {
  if (!slug) return "Без області";
  return getRegionLabel(slug) ?? slug;
}

/**
 * Згортає рядки реалізацій одного періоду у зведення. Чиста функція.
 * `newCustomerIds` — клієнти, чия ПЕРША в історії покупка припала на цей
 * період (рахуються як «нові ТТ»); обчислюється лоадером окремим запитом.
 */
export function aggregatePeriod(
  rows: readonly ManagerSaleRow[],
  newCustomerIds: ReadonlySet<string>,
): PeriodAgg {
  const groups = EMPTY_GROUPS();
  let revenueUah = 0;
  let revenueEur = 0;
  let weightKg = 0;

  interface RegionAcc {
    slug: string | null;
    revenueUah: number;
    revenueEur: number;
    weightKg: number;
    customers: Set<string>;
    newCustomers: Set<string>;
  }
  const regionMap = new Map<string, RegionAcc>();
  const clientMap = new Map<string, ClientAgg>();

  for (const r of rows) {
    revenueUah += r.totalUah;
    revenueEur += r.totalEur;
    weightKg += r.weightKg;

    for (const g of ["stock", "second", "other"] as const) {
      groups[g].revenueEur += r.groups[g].revenueEur;
      groups[g].weightKg += r.groups[g].weightKg;
    }

    const regionKey = r.regionSlug ?? "__none__";
    let ra = regionMap.get(regionKey);
    if (!ra) {
      ra = {
        slug: r.regionSlug,
        revenueUah: 0,
        revenueEur: 0,
        weightKg: 0,
        customers: new Set(),
        newCustomers: new Set(),
      };
      regionMap.set(regionKey, ra);
    }
    ra.revenueUah += r.totalUah;
    ra.revenueEur += r.totalEur;
    ra.weightKg += r.weightKg;
    ra.customers.add(r.customerId);
    if (newCustomerIds.has(r.customerId)) ra.newCustomers.add(r.customerId);

    let ca = clientMap.get(r.customerId);
    if (!ca) {
      ca = {
        customerId: r.customerId,
        customerCode1C: r.customerCode1C,
        mgrClientId: null,
        customerName: r.customerName,
        regionSlug: r.regionSlug,
        regionLabel: regionLabelFor(r.regionSlug),
        revenueUah: 0,
        revenueEur: 0,
        weightKg: 0,
        isNew: newCustomerIds.has(r.customerId),
      };
      clientMap.set(r.customerId, ca);
    }
    ca.revenueUah += r.totalUah;
    ca.revenueEur += r.totalEur;
    ca.weightKg += r.weightKg;
  }

  const byRegion: RegionAgg[] = [...regionMap.values()]
    .map((ra) => ({
      regionSlug: ra.slug,
      regionLabel: regionLabelFor(ra.slug),
      revenueUah: ra.revenueUah,
      revenueEur: ra.revenueEur,
      weightKg: ra.weightKg,
      ttCount: ra.customers.size,
      newTtCount: ra.newCustomers.size,
    }))
    .sort((a, b) => b.revenueUah - a.revenueUah);

  const byClient = [...clientMap.values()].sort(
    (a, b) => b.revenueUah - a.revenueUah,
  );

  const newTtCount = byClient.reduce((n, c) => n + (c.isNew ? 1 : 0), 0);

  return {
    revenueUah,
    revenueEur,
    weightKg,
    ttCount: clientMap.size,
    newTtCount,
    groups,
    byRegion,
    byClient,
    customerIds: [...clientMap.keys()],
  };
}

// ─── Порівняння двох періодів (спрацювання ТТ) ───────────────────────────────

/** Згортає позиції реалізацій по товарах. Чиста функція. */
export function aggregateProducts(
  items: readonly ProductItemRow[],
): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const it of items) {
    let p = map.get(it.productId);
    if (!p) {
      p = {
        productId: it.productId,
        productName: it.productName,
        articleCode: it.articleCode,
        group: it.group,
        revenueEur: 0,
        weightKg: 0,
        qty: 0,
      };
      map.set(it.productId, p);
    }
    p.revenueEur += it.revenueEur;
    p.weightKg += it.weightKg;
    p.qty += it.qty;
  }
  return [...map.values()].sort((a, b) => b.revenueEur - a.revenueEur);
}

export interface ClientRef {
  customerId: string;
  mgrClientId: string | null;
  customerName: string;
  regionLabel: string;
  revenueUah: number;
  revenueEur: number;
}

export interface PeriodComparison {
  /** ТТ, що зʼявились у поточному періоді (не купували у порівняльному). */
  gained: ClientRef[];
  /** ТТ, що «вилетіли» — купували у порівняльному, не купили у поточному. */
  lost: ClientRef[];
  /** ТТ, що купували в обох періодах. */
  stableCount: number;
  gainedCount: number;
  lostCount: number;
}

function toRef(c: ClientAgg): ClientRef {
  return {
    customerId: c.customerId,
    mgrClientId: c.mgrClientId,
    customerName: c.customerName,
    regionLabel: c.regionLabel,
    revenueUah: c.revenueUah,
    revenueEur: c.revenueEur,
  };
}

/** Порівнює склад ТТ поточного і попереднього періодів. Чиста функція. */
export function comparePeriods(
  current: PeriodAgg,
  previous: PeriodAgg,
): PeriodComparison {
  const curIds = new Set(current.customerIds);
  const prevIds = new Set(previous.customerIds);

  const gained = current.byClient
    .filter((c) => !prevIds.has(c.customerId))
    .map(toRef);
  const lost = previous.byClient
    .filter((c) => !curIds.has(c.customerId))
    .map(toRef);
  const stableCount = current.customerIds.filter((id) =>
    prevIds.has(id),
  ).length;

  return {
    gained,
    lost,
    stableCount,
    gainedCount: gained.length,
    lostCount: lost.length,
  };
}

// ─── Планове зіставлення ─────────────────────────────────────────────────────

export interface PlanValues {
  planRevenueEur: number;
  planTtCount: number;
  planNewTtCount: number;
}

export interface RegionPlanFact extends RegionAgg {
  plan: PlanValues | null;
}

// ─── Async-лоадер ────────────────────────────────────────────────────────────

export interface ManagerSummaryParams {
  /** Поточний період [from, to). */
  from: Date;
  to: Date;
  /** Порівняльний період [prevFrom, prevTo). */
  prevFrom: Date;
  prevTo: Date;
  /** Скоуп клієнтів (code1C). `null` = без обмеження (admin/аналітик). */
  scope: string[] | null;
  /** Місяць плану у форматі "YYYY-MM" (зазвичай місяць `from`). */
  planMonth: string;
  /** Ліміт списків клієнтів/спрацювання (щоб не роздувати payload). */
  clientLimit?: number;
}

export interface ManagerSummaryResult {
  current: PeriodAgg;
  previous: PeriodAgg;
  comparison: PeriodComparison;
  /** По областях поточного періоду з планом. */
  regions: RegionPlanFact[];
  /** Загальний план (по всіх областях) + факт-підсумок. */
  totalPlan: PlanValues | null;
  /** По товарах — поточний і порівняльний період (вкладка «Товари»). */
  currentProducts: ProductAgg[];
  previousProducts: ProductAgg[];
  clientLimitApplied: number;
}

const SALE_SELECT = {
  customerId: true,
  totalUah: true,
  totalEur: true,
  createdAt: true,
  customer: { select: { name: true, region: true, code1C: true } },
  items: {
    select: {
      weight: true,
      priceEur: true,
      quantity: true,
      product: {
        select: { id: true, name: true, articleCode: true, categoryId: true },
      },
    },
  },
} as const;

type RawSale = {
  customerId: string;
  totalUah: number;
  totalEur: number;
  createdAt: Date;
  customer: {
    name: string;
    region: string | null;
    code1C: string | null;
  } | null;
  items: {
    weight: number;
    priceEur: number;
    quantity: number;
    product: {
      id: string;
      name: string;
      articleCode: string | null;
      categoryId: string;
    };
  }[];
};

function toRows(
  sales: RawSale[],
  groupOf: (categoryId: string | null | undefined) => ProductGroup,
): ManagerSaleRow[] {
  return sales.map((s) => {
    const groups: SaleRowGroups = {
      stock: { revenueEur: 0, weightKg: 0 },
      second: { revenueEur: 0, weightKg: 0 },
      other: { revenueEur: 0, weightKg: 0 },
    };
    let weightKg = 0;
    for (const it of s.items) {
      const g = groupOf(it.product?.categoryId);
      groups[g].revenueEur += it.priceEur;
      groups[g].weightKg += it.weight;
      weightKg += it.weight;
    }
    return {
      customerId: s.customerId,
      customerCode1C: s.customer?.code1C ?? null,
      customerName: s.customer?.name ?? "—",
      regionSlug: s.customer?.region ?? null,
      totalUah: s.totalUah,
      totalEur: s.totalEur,
      weightKg,
      groups,
    };
  });
}

/** Плаский список позицій (для товарної агрегації) з класифікацією групи. */
function toProductItems(
  sales: RawSale[],
  groupOf: (categoryId: string | null | undefined) => ProductGroup,
): ProductItemRow[] {
  const out: ProductItemRow[] = [];
  for (const s of sales) {
    for (const it of s.items) {
      if (!it.product) continue;
      out.push({
        productId: it.product.id,
        productName: it.product.name,
        articleCode: it.product.articleCode ?? null,
        group: groupOf(it.product.categoryId),
        revenueEur: it.priceEur,
        weightKg: it.weight,
        qty: it.quantity,
      });
    }
  }
  return out;
}

export async function getManagerSummary(
  params: ManagerSummaryParams,
): Promise<ManagerSummaryResult> {
  const { from, to, prevFrom, prevTo, scope, planMonth } = params;
  const clientLimit = params.clientLimit ?? 200;

  const customerWhere = scope !== null ? { code1C: { in: scope } } : undefined;

  const baseWhere = (a: Date, b: Date) => ({
    status: "posted",
    createdAt: { gte: a, lt: b },
    ...(customerWhere ? { customer: customerWhere } : {}),
  });

  const [categories, currentSales, prevSales] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true, parentId: true },
    }),
    prisma.sale.findMany({ where: baseWhere(from, to), select: SALE_SELECT }),
    prisma.sale.findMany({
      where: baseWhere(prevFrom, prevTo),
      select: SALE_SELECT,
    }),
  ]);

  const groupOf = buildProductGroupResolver(categories);
  const currentRows = toRows(currentSales as RawSale[], groupOf);
  const prevRows = toRows(prevSales as RawSale[], groupOf);

  // «Нові ТТ» — клієнти, чия ПЕРША проведена реалізація припала на період.
  const allCustomerIds = [
    ...new Set([
      ...currentRows.map((r) => r.customerId),
      ...prevRows.map((r) => r.customerId),
    ]),
  ];
  const firstSales =
    allCustomerIds.length > 0
      ? await prisma.sale.groupBy({
          by: ["customerId"],
          where: { status: "posted", customerId: { in: allCustomerIds } },
          _min: { createdAt: true },
        })
      : [];
  const firstByCustomer = new Map<string, Date>();
  for (const g of firstSales) {
    if (g._min.createdAt) firstByCustomer.set(g.customerId, g._min.createdAt);
  }
  const newInCurrent = new Set<string>();
  const newInPrev = new Set<string>();
  for (const [id, first] of firstByCustomer) {
    if (first >= from && first < to) newInCurrent.add(id);
    if (first >= prevFrom && first < prevTo) newInPrev.add(id);
  }

  const current = aggregatePeriod(currentRows, newInCurrent);
  const previous = aggregatePeriod(prevRows, newInPrev);

  // Резолвимо MgrClient.id по code1C для лінка на картку клієнта.
  const codes = [
    ...new Set(
      [...current.byClient, ...previous.byClient]
        .map((c) => c.customerCode1C)
        .filter((c): c is string => !!c),
    ),
  ];
  if (codes.length > 0) {
    const mgrClients = await prisma.mgrClient.findMany({
      where: { code1C: { in: codes } },
      select: { id: true, code1C: true },
    });
    const idByCode = new Map<string, string>();
    for (const m of mgrClients) if (m.code1C) idByCode.set(m.code1C, m.id);
    for (const c of [...current.byClient, ...previous.byClient]) {
      if (c.customerCode1C)
        c.mgrClientId = idByCode.get(c.customerCode1C) ?? null;
    }
  }

  const comparison = comparePeriods(current, previous);

  // Товарна агрегація.
  const currentProducts = aggregateProducts(
    toProductItems(currentSales as RawSale[], groupOf),
  ).slice(0, clientLimit);
  const previousProducts = aggregateProducts(
    toProductItems(prevSales as RawSale[], groupOf),
  ).slice(0, clientLimit);

  // План на місяць.
  const plans = await prisma.salesPlan.findMany({
    where: { month: planMonth },
  });
  const planBySlug = new Map<string, PlanValues>();
  for (const p of plans) {
    planBySlug.set(p.regionSlug, {
      planRevenueEur: p.planRevenueEur,
      planTtCount: p.planTtCount,
      planNewTtCount: p.planNewTtCount,
    });
  }

  const regions: RegionPlanFact[] = current.byRegion.map((r) => ({
    ...r,
    plan: r.regionSlug ? (planBySlug.get(r.regionSlug) ?? null) : null,
  }));
  const totalPlan = planBySlug.get(TOTAL_PLAN_SLUG) ?? null;

  // Обрізаємо довгі списки клієнтів (payload).
  current.byClient = current.byClient.slice(0, clientLimit);
  previous.byClient = previous.byClient.slice(0, clientLimit);
  comparison.gained = comparison.gained.slice(0, clientLimit);
  comparison.lost = comparison.lost.slice(0, clientLimit);

  return {
    current,
    previous,
    comparison,
    regions,
    totalPlan,
    currentProducts,
    previousProducts,
    clientLimitApplied: clientLimit,
  };
}
