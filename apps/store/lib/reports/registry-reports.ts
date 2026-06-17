/**
 * Чисті агрегації звітів над матеріалізованими регістрами (Фаза 2, 5.6):
 *   - sales-summary  — виручка/кг/кількість у розрізі клієнт·товар·агент
 *   - cashflow       — ДДС по статтях (прихід/розхід/сальдо)
 *   - stock-balance  — залишки складу (шт+кг) × якість/категорія на дату
 *
 * Логіка винесена з page.tsx, щоб тестувати без БД. Сторінки лише читають рухи
 * з Prisma і викликають ці функції.
 */

// ─── 1. Sales summary (Продажі) ─────────────────────────────────────────────

/** Один рух продажу (lite-зріз для агрегацій). */
export interface SalesMovementLite {
  /** Ключ групування (clientCode1C / productCode1C / agentCode1C). */
  clientCode1C: string | null;
  clientName: string | null;
  productCode1C: string | null;
  productName: string | null;
  agentCode1C: string | null;
  agentName: string | null;
  qty: number;
  weightKg: number | null;
  revenueEur: number;
  revenueNoDiscountEur: number | null;
  /** 0=прихід (продаж), 1=розхід (повернення). */
  recordKind: number;
}

export type SalesGroupBy = "client" | "product" | "agent";

export interface SalesSummaryRow {
  key: string;
  label: string;
  qty: number;
  weightKg: number;
  revenueEur: number;
  revenueNoDiscountEur: number;
  /** Знижка = СтоимостьБезСкидок − Стоимость (ефект знижок у EUR). */
  discountEur: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Знак за видом руху: прихід (+1) / розхід (−1, повернення зменшує продажі). */
function salesSign(kind: number): number {
  return kind === 1 ? -1 : 1;
}

/**
 * Зводить рухи продажів у підсумок по обраному вимірі.
 * Сортування — за виручкою спадно.
 */
export function summarizeSales(
  movements: SalesMovementLite[],
  groupBy: SalesGroupBy,
): SalesSummaryRow[] {
  const acc = new Map<string, SalesSummaryRow>();

  for (const m of movements) {
    const sign = salesSign(m.recordKind);
    const { key, label } = salesGroupKey(m, groupBy);
    let row = acc.get(key);
    if (!row) {
      row = {
        key,
        label,
        qty: 0,
        weightKg: 0,
        revenueEur: 0,
        revenueNoDiscountEur: 0,
        discountEur: 0,
      };
      acc.set(key, row);
    }
    row.qty += sign * m.qty;
    row.weightKg += sign * (m.weightKg ?? 0);
    row.revenueEur += sign * m.revenueEur;
    row.revenueNoDiscountEur += sign * (m.revenueNoDiscountEur ?? m.revenueEur);
  }

  const rows = [...acc.values()].map((r) => ({
    key: r.key,
    label: r.label,
    qty: round3(r.qty),
    weightKg: round3(r.weightKg),
    revenueEur: round2(r.revenueEur),
    revenueNoDiscountEur: round2(r.revenueNoDiscountEur),
    discountEur: round2(r.revenueNoDiscountEur - r.revenueEur),
  }));
  rows.sort((a, b) => b.revenueEur - a.revenueEur);
  return rows;
}

function salesGroupKey(
  m: SalesMovementLite,
  groupBy: SalesGroupBy,
): { key: string; label: string } {
  if (groupBy === "product") {
    return {
      key: m.productCode1C ?? "—",
      label: m.productName ?? m.productCode1C ?? "—",
    };
  }
  if (groupBy === "agent") {
    return {
      key: m.agentCode1C ?? "—",
      label: m.agentName ?? m.agentCode1C ?? "Без агента",
    };
  }
  return {
    key: m.clientCode1C ?? "—",
    label: m.clientName ?? m.clientCode1C ?? "—",
  };
}

/** Підсумковий рядок «Разом» по всіх групах. */
export function totalSales(rows: SalesSummaryRow[]): SalesSummaryRow {
  const t = rows.reduce(
    (a, r) => {
      a.qty += r.qty;
      a.weightKg += r.weightKg;
      a.revenueEur += r.revenueEur;
      a.revenueNoDiscountEur += r.revenueNoDiscountEur;
      a.discountEur += r.discountEur;
      return a;
    },
    {
      qty: 0,
      weightKg: 0,
      revenueEur: 0,
      revenueNoDiscountEur: 0,
      discountEur: 0,
    },
  );
  return {
    key: "__total__",
    label: "Разом",
    qty: round3(t.qty),
    weightKg: round3(t.weightKg),
    revenueEur: round2(t.revenueEur),
    revenueNoDiscountEur: round2(t.revenueNoDiscountEur),
    discountEur: round2(t.discountEur),
  };
}

// ─── 2. Cash-flow по статтях (ДДС) ──────────────────────────────────────────

export interface CashFlowMovementLite {
  articleCode1C: string | null;
  articleName: string | null;
  direction: number; // 0=прихід / 1=розхід
  amountUah: number;
  amountUpr: number | null;
}

export interface CashFlowSummaryRow {
  key: string;
  label: string;
  inflowUah: number;
  outflowUah: number;
  /** Прихід − розхід. */
  netUah: number;
}

/** Зводить рух коштів по статтях: прихід / розхід / сальдо. */
export function summarizeCashFlow(
  movements: CashFlowMovementLite[],
): CashFlowSummaryRow[] {
  const acc = new Map<
    string,
    { inflow: number; outflow: number; label: string }
  >();

  for (const m of movements) {
    const key = m.articleCode1C ?? "—";
    const label = m.articleName ?? m.articleCode1C ?? "Без статті";
    let row = acc.get(key);
    if (!row) {
      row = { inflow: 0, outflow: 0, label };
      acc.set(key, row);
    }
    if (m.direction === 1) {
      row.outflow += m.amountUah;
    } else {
      row.inflow += m.amountUah;
    }
  }

  const rows = [...acc.entries()].map(([key, r]) => ({
    key,
    label: r.label,
    inflowUah: round2(r.inflow),
    outflowUah: round2(r.outflow),
    netUah: round2(r.inflow - r.outflow),
  }));
  rows.sort((a, b) => Math.abs(b.netUah) - Math.abs(a.netUah));
  return rows;
}

/** Підсумок ДДС: загальний прихід/розхід/сальдо. */
export function totalCashFlow(rows: CashFlowSummaryRow[]): CashFlowSummaryRow {
  const t = rows.reduce(
    (a, r) => {
      a.inflowUah += r.inflowUah;
      a.outflowUah += r.outflowUah;
      a.netUah += r.netUah;
      return a;
    },
    { inflowUah: 0, outflowUah: 0, netUah: 0 },
  );
  return {
    key: "__total__",
    label: "Разом",
    inflowUah: round2(t.inflowUah),
    outflowUah: round2(t.outflowUah),
    netUah: round2(t.netUah),
  };
}

// ─── 3. Stock balance (залишки на дату) ─────────────────────────────────────

export interface StockMovementLite {
  productCode1C: string;
  productName: string | null;
  quality: string | null;
  qty: number;
  weightKg: number | null;
  /** 0=прихід / 1=розхід. */
  recordKind: number;
}

export type StockGroupBy = "product" | "quality";

export interface StockBalanceRow {
  key: string;
  label: string;
  qty: number;
  weightKg: number;
}

/**
 * Залишок = Σ(приходи) − Σ(розходи) по обраному вимірі. Рядки з нульовим
 * залишком (шт і кг) відкидаються.
 */
export function summarizeStockBalance(
  movements: StockMovementLite[],
  groupBy: StockGroupBy,
): StockBalanceRow[] {
  const acc = new Map<string, StockBalanceRow>();

  for (const m of movements) {
    const sign = m.recordKind === 1 ? -1 : 1;
    const key = groupBy === "quality" ? (m.quality ?? "—") : m.productCode1C;
    const label =
      groupBy === "quality"
        ? (m.quality ?? "Без якості")
        : (m.productName ?? m.productCode1C);
    let row = acc.get(key);
    if (!row) {
      row = { key, label, qty: 0, weightKg: 0 };
      acc.set(key, row);
    }
    row.qty += sign * m.qty;
    row.weightKg += sign * (m.weightKg ?? 0);
  }

  const rows = [...acc.values()]
    .map((r) => ({
      key: r.key,
      label: r.label,
      qty: round3(r.qty),
      weightKg: round3(r.weightKg),
    }))
    .filter((r) => r.qty !== 0 || r.weightKg !== 0);
  rows.sort((a, b) => b.weightKg - a.weightKg || b.qty - a.qty);
  return rows;
}

/** Підсумок залишків (шт + кг). */
export function totalStock(rows: StockBalanceRow[]): StockBalanceRow {
  const t = rows.reduce(
    (a, r) => {
      a.qty += r.qty;
      a.weightKg += r.weightKg;
      return a;
    },
    { qty: 0, weightKg: 0 },
  );
  return {
    key: "__total__",
    label: "Разом",
    qty: round3(t.qty),
    weightKg: round3(t.weightKg),
  };
}
