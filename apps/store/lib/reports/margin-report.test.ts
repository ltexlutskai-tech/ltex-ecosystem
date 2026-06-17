import { describe, it, expect } from "vitest";
import {
  computeMargin,
  totalMargin,
  type RevenueLine,
  type CostLine,
} from "./margin-report";

function rev(key: string, label: string, revenueEur: number): RevenueLine {
  return { key, label, revenueEur };
}
function cost(key: string, costEur: number): CostLine {
  return { key, costEur };
}

describe("computeMargin", () => {
  it("один товар: валовий прибуток = виручка − собівартість, маржа %", () => {
    const rows = computeMargin([rev("p1", "Куртки", 100)], [cost("p1", 60)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "p1",
      label: "Куртки",
      revenueEur: 100,
      costEur: 60,
      grossEur: 40,
      marginPct: 40,
    });
  });

  it("агрегує кілька рядків одного ключа", () => {
    const rows = computeMargin(
      [rev("p1", "Куртки", 100), rev("p1", "Куртки", 50)],
      [cost("p1", 30), cost("p1", 30)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revenueEur).toBe(150);
    expect(rows[0]!.costEur).toBe(60);
    expect(rows[0]!.grossEur).toBe(90);
    expect(rows[0]!.marginPct).toBe(60);
  });

  it("виручка без собівартості → валовий = виручка, маржа 100%", () => {
    const rows = computeMargin([rev("p1", "Шкарпетки", 80)], []);
    expect(rows[0]!.costEur).toBe(0);
    expect(rows[0]!.grossEur).toBe(80);
    expect(rows[0]!.marginPct).toBe(100);
  });

  it("собівартість без виручки теж потрапляє у звіт (маржа = null)", () => {
    const rows = computeMargin([], [cost("p9", 25)], "Невідомо");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "p9",
      label: "Невідомо",
      revenueEur: 0,
      costEur: 25,
      grossEur: -25,
      marginPct: null,
    });
  });

  it("сортує за валовим прибутком спадаюче", () => {
    const rows = computeMargin(
      [rev("a", "A", 100), rev("b", "B", 200), rev("c", "C", 50)],
      [cost("a", 10), cost("b", 190), cost("c", 5)],
    );
    // gross: A=90, B=10, C=45 → A, C, B
    expect(rows.map((r) => r.key)).toEqual(["a", "c", "b"]);
  });

  it("збиткова група: від'ємний валовий прибуток і від'ємна маржа", () => {
    const rows = computeMargin(
      [rev("p1", "Розпродаж", 100)],
      [cost("p1", 130)],
    );
    expect(rows[0]!.grossEur).toBe(-30);
    expect(rows[0]!.marginPct).toBe(-30);
  });

  it("округлення до 2 знаків", () => {
    const rows = computeMargin([rev("p1", "X", 33.333)], [cost("p1", 11.111)]);
    expect(rows[0]!.revenueEur).toBe(33.33);
    expect(rows[0]!.costEur).toBe(11.11);
    expect(rows[0]!.grossEur).toBe(22.22);
  });
});

describe("totalMargin", () => {
  it("підсумовує всі рядки і рахує загальну маржу", () => {
    const rows = computeMargin(
      [rev("a", "A", 100), rev("b", "B", 100)],
      [cost("a", 40), cost("b", 60)],
    );
    const total = totalMargin(rows);
    expect(total.revenueEur).toBe(200);
    expect(total.costEur).toBe(100);
    expect(total.grossEur).toBe(100);
    expect(total.marginPct).toBe(50);
  });

  it("порожній звіт → нулі та маржа null", () => {
    const total = totalMargin([]);
    expect(total.revenueEur).toBe(0);
    expect(total.costEur).toBe(0);
    expect(total.grossEur).toBe(0);
    expect(total.marginPct).toBeNull();
  });
});
