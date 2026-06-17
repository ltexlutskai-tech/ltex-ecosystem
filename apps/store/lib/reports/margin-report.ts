import { prisma } from "@ltex/db";
import { resolvePeriod, type PeriodPreset } from "@/lib/finance/owner-stats";
import type { ReportShape } from "@/lib/reports/analyst-reports";

/**
 * Звіт «Маржа / Валовий прибуток» (Фаза 3, 5.6).
 *
 * Валовий прибуток = Виручка (реалізації) − Собівартість (рухи `CostMovement`,
 * наповнені з 1С AccumRg ПродажиСебестоимость `_AccumRg5634`).
 *
 *   Виручка     ← Sale/SaleItem (status='posted'), priceEur (EUR-головна сума);
 *   Собівартість ← CostMovement.costEur, зв'язана з реалізацією через
 *                  recorderCode1C = Sale.code1C.
 *
 * Групування: по товарах / клієнтах / агентах / категоріях. Колонки:
 * Виручка, Собівартість, Валовий прибуток, Маржа %.
 *
 * Ядро (`computeMargin`) — чиста функція без БД (тестується ізольовано); навколо
 * неї — `reportMargin`, що тягне дані за період і збирає `ReportShape`.
 */

export type MarginGroupBy = "product" | "client" | "agent" | "category";

export const MARGIN_GROUPS: MarginGroupBy[] = [
  "product",
  "client",
  "agent",
  "category",
];

export const MARGIN_GROUP_LABELS: Record<MarginGroupBy, string> = {
  product: "Товари",
  client: "Клієнти",
  agent: "Торгові агенти",
  category: "Категорії",
};

/** Заголовок колонки групи (однина) для табличного звіту. */
const MARGIN_GROUP_COLUMN: Record<MarginGroupBy, string> = {
  product: "Товар",
  client: "Клієнт",
  agent: "Торговий агент",
  category: "Категорія",
};

/** Рядок виручки: ключ групи + назва + сума EUR. */
export interface RevenueLine {
  key: string;
  label: string;
  revenueEur: number;
}

/** Рядок собівартості: ключ групи + сума EUR. */
export interface CostLine {
  key: string;
  costEur: number;
}

/** Підсумок по групі. */
export interface MarginRow {
  key: string;
  label: string;
  revenueEur: number;
  costEur: number;
  grossEur: number;
  marginPct: number | null; // null коли виручка = 0 (ділення на 0)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Чисте ядро звіту: зводить виручку та собівартість по спільному ключу групи.
 *
 * - Групи, які є лише у собівартості (без виручки), теж потрапляють у звіт
 *   (label = переданий fallback або сам key) — інакше «прихована» собівартість
 *   зникає й валовий прибуток завищується.
 * - Маржа % = валовий прибуток / виручка × 100; null коли виручка = 0.
 * - Сортування — за валовим прибутком спадаюче (найприбутковіші зверху).
 */
export function computeMargin(
  revenue: RevenueLine[],
  cost: CostLine[],
  unknownLabel = "—",
): MarginRow[] {
  const map = new Map<
    string,
    { label: string; revenueEur: number; costEur: number }
  >();

  for (const r of revenue) {
    const cur = map.get(r.key) ?? {
      label: r.label,
      revenueEur: 0,
      costEur: 0,
    };
    cur.revenueEur += r.revenueEur;
    if (r.label && cur.label === "") cur.label = r.label;
    map.set(r.key, cur);
  }

  for (const c of cost) {
    const cur = map.get(c.key) ?? {
      label: unknownLabel,
      revenueEur: 0,
      costEur: 0,
    };
    cur.costEur += c.costEur;
    map.set(c.key, cur);
  }

  const rows: MarginRow[] = [...map.entries()].map(([key, v]) => {
    const grossEur = round2(v.revenueEur - v.costEur);
    const marginPct =
      v.revenueEur > 0 ? round2((grossEur / v.revenueEur) * 100) : null;
    return {
      key,
      label: v.label || unknownLabel,
      revenueEur: round2(v.revenueEur),
      costEur: round2(v.costEur),
      grossEur,
      marginPct,
    };
  });

  rows.sort((a, b) => b.grossEur - a.grossEur);
  return rows;
}

/** Рядок підсумку «Разом» по всьому звіту. */
export function totalMargin(rows: MarginRow[]): MarginRow {
  const revenueEur = round2(rows.reduce((s, r) => s + r.revenueEur, 0));
  const costEur = round2(rows.reduce((s, r) => s + r.costEur, 0));
  const grossEur = round2(revenueEur - costEur);
  return {
    key: "_total",
    label: "Разом",
    revenueEur,
    costEur,
    grossEur,
    marginPct: revenueEur > 0 ? round2((grossEur / revenueEur) * 100) : null,
  };
}

// ─── Дані з БД ──────────────────────────────────────────────────────────────

export async function reportMargin(
  groupBy: MarginGroupBy = "product",
  preset: PeriodPreset = "month",
): Promise<ReportShape> {
  const period = resolvePeriod(preset);

  // Виручка: posted-реалізації за період. Тягнемо рядки + sale-контекст.
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: "posted",
        createdAt: { gte: period.from, lte: period.to },
      },
    },
    select: {
      priceEur: true,
      productId: true,
      product: {
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      },
      sale: {
        select: {
          code1C: true,
          agentName: true,
          assignedAgentUserId: true,
          customer: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Собівартість: рухи за період, зв'язані з posted-реалізаціями.
  // Тягнемо лише ті, що належать реалізаціям з виручкового набору (за code1C),
  // щоб не змішувати періоди/чернетки.
  const saleCodes = new Set<string>();
  for (const it of items) {
    if (it.sale.code1C) saleCodes.add(it.sale.code1C);
  }
  const costMovements =
    saleCodes.size > 0
      ? await prisma.costMovement.findMany({
          where: { recorderCode1C: { in: [...saleCodes] } },
          select: {
            recorderCode1C: true,
            productId: true,
            productCode1C: true,
            costEur: true,
          },
        })
      : [];

  // Резолв-мапа реалізація(code1C) → контекст (agent/client) для атрибуції
  // собівартості до тих самих груп, що й виручка.
  const saleCtxByCode = new Map<
    string,
    {
      agentKey: string;
      agentLabel: string;
      clientKey: string;
      clientLabel: string;
    }
  >();
  for (const it of items) {
    const code = it.sale.code1C;
    if (!code || saleCtxByCode.has(code)) continue;
    saleCtxByCode.set(code, {
      agentKey: it.sale.assignedAgentUserId ?? it.sale.agentName ?? "_none",
      agentLabel: it.sale.agentName ?? "Не призначено",
      clientKey: it.sale.customer?.id ?? "_none",
      clientLabel: it.sale.customer?.name ?? "—",
    });
  }

  // Резолв product → category (для cost-рядків без власного category).
  const prodCat = new Map<string, { catKey: string; catLabel: string }>();
  for (const it of items) {
    if (it.product) {
      prodCat.set(it.product.id, {
        catKey: it.product.category?.id ?? it.product.categoryId,
        catLabel: it.product.category?.name ?? "—",
      });
    }
  }

  // ─── Побудова revenue/cost рядків під обрану групу ───
  const revenue: RevenueLine[] = [];
  for (const it of items) {
    revenue.push(revenueLineFor(groupBy, it));
  }

  const cost: CostLine[] = [];
  for (const cm of costMovements) {
    cost.push(costLineFor(groupBy, cm, saleCtxByCode, prodCat));
  }

  const rows = computeMargin(revenue, cost);
  const total = totalMargin(rows);

  return {
    title: `Маржа / Валовий прибуток — ${MARGIN_GROUP_LABELS[groupBy]}`,
    period,
    headers: [
      "#",
      MARGIN_GROUP_COLUMN[groupBy],
      "Виручка €",
      "Собівартість €",
      "Валовий прибуток €",
      "Маржа %",
    ],
    rows: [
      ...rows.map((r, idx) => [
        idx + 1,
        r.label,
        r.revenueEur,
        r.costEur,
        r.grossEur,
        r.marginPct === null ? "—" : r.marginPct,
      ]),
      // Підсумковий рядок «Разом» (без номера).
      [
        "",
        total.label,
        total.revenueEur,
        total.costEur,
        total.grossEur,
        total.marginPct === null ? "—" : total.marginPct,
      ],
    ],
  };
}

type SaleItemLite = {
  priceEur: number;
  product: {
    id: string;
    name: string;
    categoryId: string;
    category: { id: string; name: string } | null;
  } | null;
  sale: {
    code1C: string | null;
    agentName: string | null;
    assignedAgentUserId: string | null;
    customer: { id: string; name: string } | null;
  };
};

function revenueLineFor(groupBy: MarginGroupBy, it: SaleItemLite): RevenueLine {
  switch (groupBy) {
    case "product":
      return {
        key: it.product?.id ?? "_none",
        label: it.product?.name ?? "—",
        revenueEur: it.priceEur,
      };
    case "client":
      return {
        key: it.sale.customer?.id ?? "_none",
        label: it.sale.customer?.name ?? "—",
        revenueEur: it.priceEur,
      };
    case "agent":
      return {
        key: it.sale.assignedAgentUserId ?? it.sale.agentName ?? "_none",
        label: it.sale.agentName ?? "Не призначено",
        revenueEur: it.priceEur,
      };
    case "category":
      return {
        key: it.product?.category?.id ?? it.product?.categoryId ?? "_none",
        label: it.product?.category?.name ?? "—",
        revenueEur: it.priceEur,
      };
  }
}

type CostMovementLite = {
  recorderCode1C: string;
  productId: string | null;
  productCode1C: string | null;
  costEur: unknown; // Prisma Decimal
};

function costLineFor(
  groupBy: MarginGroupBy,
  cm: CostMovementLite,
  saleCtxByCode: Map<
    string,
    {
      agentKey: string;
      clientKey: string;
    }
  >,
  prodCat: Map<string, { catKey: string }>,
): CostLine {
  const costEur = Number(cm.costEur ?? 0);
  switch (groupBy) {
    case "product":
      return { key: cm.productId ?? cm.productCode1C ?? "_none", costEur };
    case "client": {
      const ctx = saleCtxByCode.get(cm.recorderCode1C);
      return { key: ctx?.clientKey ?? "_none", costEur };
    }
    case "agent": {
      const ctx = saleCtxByCode.get(cm.recorderCode1C);
      return { key: ctx?.agentKey ?? "_none", costEur };
    }
    case "category": {
      const cat = cm.productId ? prodCat.get(cm.productId) : undefined;
      return { key: cat?.catKey ?? "_none", costEur };
    }
  }
}
