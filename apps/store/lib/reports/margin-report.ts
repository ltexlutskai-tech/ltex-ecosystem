/**
 * Чисте ядро звіту «Маржа / Валовий прибуток» (Фаза 3, 5.6).
 *
 * Валовий прибуток = Виручка (реалізації) − Собівартість (рухи `CostMovement`,
 * наповнені з 1С AccumRg ПродажиСебестоимость `_AccumRg5634`).
 *
 * DB-частина звіту переїхала у гнучкий білдер `margin-flex.ts`
 * (`buildMarginFlexReport`) — там дані тягнуться з Prisma, групуються деревом і
 * сплющуються у `ReportShape` для CSV/XLSX. Тут лишаються лише чисті функції
 * `computeMargin` / `totalMargin` (юніт-тестуються ізольовано).
 */

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
