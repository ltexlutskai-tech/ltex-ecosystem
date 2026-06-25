import { describe, it, expect } from "vitest";
import { buildSalesTree, type NormalizedRow } from "./sales-flex";
import {
  deriveMarginPct,
  flattenMarginToReportShape,
  MARGIN_DIMENSIONS,
  MARGIN_INDICATORS,
  type MarginFlexResult,
} from "./margin-flex";

// Базові сумовні показники, які дерево маржі агрегує ЗАВЖДИ.
const SUM_KEYS = ["revenueEur", "costEur", "grossEur"];

/** Будує нормалізований рядок (вже з grossEur = revenue − cost). */
function row(
  dims: Record<string, string>,
  revenueEur: number,
  costEur: number,
): NormalizedRow {
  const d: NormalizedRow["dims"] = {};
  for (const [k, label] of Object.entries(dims)) d[k] = { id: label, label };
  return {
    dims: d,
    values: { revenueEur, costEur, grossEur: revenueEur - costEur },
  };
}

function findNode(
  nodes: ReturnType<typeof buildSalesTree>,
  label: string,
): (typeof nodes)[number] | undefined {
  for (const n of nodes) {
    if (n.label === label) return n;
    const found = findNode(n.children, label);
    if (found) return found;
  }
  return undefined;
}

// ─── deriveMarginPct ──────────────────────────────────────────────────────────

describe("deriveMarginPct", () => {
  it("маржа % = валовий / виручка × 100", () => {
    expect(
      deriveMarginPct({ revenueEur: 100, costEur: 60, grossEur: 40 }),
    ).toBe(40);
  });

  it("null коли виручка = 0 (ділення на 0)", () => {
    expect(
      deriveMarginPct({ revenueEur: 0, costEur: 25, grossEur: -25 }),
    ).toBeNull();
  });

  it("null коли виручка від'ємна", () => {
    expect(
      deriveMarginPct({ revenueEur: -10, costEur: 0, grossEur: -10 }),
    ).toBeNull();
  });

  it("від'ємна маржа при збитку", () => {
    expect(
      deriveMarginPct({ revenueEur: 100, costEur: 130, grossEur: -30 }),
    ).toBe(-30);
  });

  it("округлення до 2 знаків", () => {
    // gross/rev = 1/3 → 33.333… → 33.33
    expect(deriveMarginPct({ revenueEur: 3, costEur: 2, grossEur: 1 })).toBe(
      33.33,
    );
  });
});

// ─── tree: суми grossEur + marginPct ОБЧИСЛЮЄТЬСЯ (не сумується) на вузлі ──────

describe("margin tree aggregation", () => {
  it("валовий прибуток сумується по групі", () => {
    const rows = [
      row({ product: "Куртки" }, 100, 60),
      row({ product: "Куртки" }, 50, 30),
      row({ product: "Шапки" }, 30, 10),
    ];
    const tree = buildSalesTree(rows, ["product"], SUM_KEYS);
    const k = findNode(tree, "Куртки")!;
    expect(k.values.revenueEur).toBe(150);
    expect(k.values.costEur).toBe(90);
    expect(k.values.grossEur).toBe(60);
    const h = findNode(tree, "Шапки")!;
    expect(h.values.grossEur).toBe(20);
  });

  it("marginPct рахується з агрегатів вузла, а НЕ сумою дочірніх відсотків", () => {
    // Дочірні: A 100/40 → margin 60%; B 100/90 → margin 10%.
    // Сума відсотків = 70%, а ПРАВИЛЬНА маржа батька = gross 70 / rev 200 = 35%.
    const rows = [
      row({ region: "R", client: "A" }, 100, 40),
      row({ region: "R", client: "B" }, 100, 90),
    ];
    const tree = buildSalesTree(rows, ["region", "client"], SUM_KEYS);
    const r = findNode(tree, "R")!;
    expect(r.values.revenueEur).toBe(200);
    expect(r.values.grossEur).toBe(70); // (100-40)+(100-90)
    // Похідна на батьківському вузлі = gross/rev × 100 = 35%.
    expect(deriveMarginPct(r.values)).toBe(35);
    // НЕ дорівнює сумі дочірніх відсотків (60 + 10 = 70).
    const a = findNode(r.children, "A")!;
    const b = findNode(r.children, "B")!;
    expect(deriveMarginPct(a.values)).toBe(60);
    expect(deriveMarginPct(b.values)).toBe(10);
    expect(deriveMarginPct(a.values)! + deriveMarginPct(b.values)!).toBe(70);
    expect(deriveMarginPct(r.values)).not.toBe(70);
  });

  it("батьківський grossEur = Σ дочірніх grossEur", () => {
    const rows = [
      row({ region: "R1", client: "A" }, 100, 30),
      row({ region: "R1", client: "B" }, 200, 50),
      row({ region: "R2", client: "C" }, 50, 50),
    ];
    const tree = buildSalesTree(rows, ["region", "client"], SUM_KEYS);
    const r1 = findNode(tree, "R1")!;
    const childSum = r1.children.reduce((s, c) => s + c.values.grossEur!, 0);
    expect(r1.values.grossEur).toBe(childSum);
    expect(r1.values.grossEur).toBe(220); // (100-30)+(200-50)
    const r2 = findNode(tree, "R2")!;
    expect(r2.values.grossEur).toBe(0);
    expect(deriveMarginPct(r2.values)).toBe(0);
  });

  it("рядок лише з собівартістю (виручка 0) враховується у валовому", () => {
    // «Прихована» собівартість без виручки не повинна зникати.
    const rows = [
      row({ product: "Товар" }, 0, 25), // cost-only
    ];
    const tree = buildSalesTree(rows, ["product"], SUM_KEYS);
    const t = findNode(tree, "Товар")!;
    expect(t.values.revenueEur).toBe(0);
    expect(t.values.costEur).toBe(25);
    expect(t.values.grossEur).toBe(-25);
    expect(deriveMarginPct(t.values)).toBeNull();
  });

  it("знак: повернення (від'ємна виручка) зменшує валовий", () => {
    const rows = [
      row({ product: "X" }, 100, 60),
      row({ product: "X" }, -40, -24), // повернення (вже зі знаком)
    ];
    const tree = buildSalesTree(rows, ["product"], SUM_KEYS);
    const x = findNode(tree, "X")!;
    expect(x.values.revenueEur).toBe(60);
    expect(x.values.costEur).toBe(36);
    expect(x.values.grossEur).toBe(24);
  });
});

// ─── flattenMarginToReportShape ───────────────────────────────────────────────

describe("flattenMarginToReportShape", () => {
  function resultFor(rows: NormalizedRow[]): MarginFlexResult {
    const groups = ["product"];
    const indicators = ["revenueEur", "costEur", "grossEur", "marginPct"];
    const tree = buildSalesTree(rows, groups, SUM_KEYS);
    const grand = SUM_KEYS.reduce(
      (acc, k) => {
        acc[k] = rows.reduce((s, r) => s + (r.values[k] ?? 0), 0);
        return acc;
      },
      {} as Record<string, number>,
    );
    return {
      groups,
      indicators,
      groupLabels: ["Товар"],
      indicatorDefs: MARGIN_INDICATORS.map((i) => ({
        key: i.key,
        label: i.label,
        kind: i.kind,
      })),
      tree,
      grand,
      showTotals: true,
      rowCount: rows.length,
      tooLarge: false,
      filterOptions: {},
    };
  }

  it("рендерить marginPct рядком та додає «Разом»", () => {
    const rows = [
      row({ product: "Куртки" }, 100, 60),
      row({ product: "Шапки" }, 0, 25),
    ];
    const shape = flattenMarginToReportShape(resultFor(rows));
    expect(shape.headers).toEqual([
      "Групування",
      "Виручка, €",
      "Собівартість, €",
      "Валовий прибуток, €",
      "Маржа, %",
    ]);
    const kurtky = shape.rows.find((r) => String(r[0]).trim() === "Куртки")!;
    expect(kurtky[4]).toBe(40); // marginPct число
    const shapky = shape.rows.find((r) => String(r[0]).trim() === "Шапки")!;
    expect(shapky[4]).toBe("—"); // null → «—»
    const total = shape.rows.find((r) => r[0] === "Разом")!;
    expect(total[1]).toBe(100); // виручка
    expect(total[3]).toBe(15); // валовий = 100-85
  });
});

// ─── реєстри ──────────────────────────────────────────────────────────────────

describe("registries", () => {
  it("вимірі: product/category/client/region/city/agent/year/month", () => {
    expect(MARGIN_DIMENSIONS.map((d) => d.key)).toEqual([
      "product",
      "category",
      "client",
      "region",
      "city",
      "agent",
      "year",
      "month",
    ]);
  });

  it("показники: revenueEur/costEur/grossEur (money) + marginPct (percent)", () => {
    expect(MARGIN_INDICATORS.map((i) => i.key)).toEqual([
      "revenueEur",
      "costEur",
      "grossEur",
      "marginPct",
    ]);
    const pct = MARGIN_INDICATORS.find((i) => i.key === "marginPct")!;
    expect(pct.kind).toBe("percent");
  });
});
