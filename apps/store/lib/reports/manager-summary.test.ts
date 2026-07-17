import { describe, it, expect } from "vitest";
import {
  aggregatePeriod,
  comparePeriods,
  normalizeMonth,
  monthToRange,
  shiftMonth,
  type ManagerSaleRow,
} from "./manager-summary";

describe("month helpers", () => {
  it("normalizeMonth", () => {
    expect(normalizeMonth("2026-07")).toBe("2026-07");
    expect(normalizeMonth(" 2026-01 ")).toBe("2026-01");
    expect(normalizeMonth("2026-13")).toBeNull();
    expect(normalizeMonth("2026-7")).toBeNull();
    expect(normalizeMonth(undefined)).toBeNull();
    expect(normalizeMonth("garbage")).toBeNull();
  });

  it("monthToRange (UTC, півінтервал)", () => {
    const { from, to } = monthToRange("2026-02");
    expect(from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("shiftMonth через межі року", () => {
    expect(shiftMonth("2026-07", -1)).toBe("2026-06");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-07", -12)).toBe("2025-07"); // той самий місяць торік
  });
});

function row(
  customerId: string,
  regionSlug: string | null,
  totalUah: number,
  totalEur: number,
  groups: Partial<ManagerSaleRow["groups"]> = {},
): ManagerSaleRow {
  const g = {
    stock: { revenueEur: 0, weightKg: 0 },
    second: { revenueEur: 0, weightKg: 0 },
    other: { revenueEur: 0, weightKg: 0 },
    ...groups,
  };
  const weightKg = g.stock.weightKg + g.second.weightKg + g.other.weightKg || 0;
  return {
    customerId,
    customerName: `Клієнт ${customerId}`,
    regionSlug,
    totalUah,
    totalEur,
    weightKg,
    groups: g,
  };
}

describe("aggregatePeriod", () => {
  const rows: ManagerSaleRow[] = [
    row("c1", "volynska", 1000, 25, {
      stock: { revenueEur: 10, weightKg: 40 },
      second: { revenueEur: 15, weightKg: 60 },
    }),
    row("c1", "volynska", 500, 12, {
      second: { revenueEur: 12, weightKg: 30 },
    }),
    row("c2", "lvivska", 2000, 50, {
      stock: { revenueEur: 50, weightKg: 100 },
    }),
    row("c3", null, 300, 7, { other: { revenueEur: 7, weightKg: 10 } }),
  ];
  const agg = aggregatePeriod(rows, new Set(["c2"]));

  it("сумує виручку ₴/€ та тонаж", () => {
    expect(agg.revenueUah).toBe(3800);
    expect(agg.revenueEur).toBe(94);
    expect(agg.weightKg).toBe(40 + 60 + 30 + 100 + 10);
  });

  it("к-сть ТТ = унікальні клієнти; нові ТТ = у множині", () => {
    expect(agg.ttCount).toBe(3); // c1,c2,c3
    expect(agg.newTtCount).toBe(1); // c2
  });

  it("розбивка по групах Сток/Секонд/Інше (€ + кг)", () => {
    expect(agg.groups.stock).toEqual({ revenueEur: 60, weightKg: 140 });
    expect(agg.groups.second).toEqual({ revenueEur: 27, weightKg: 90 });
    expect(agg.groups.other).toEqual({ revenueEur: 7, weightKg: 10 });
  });

  it("по областях: виручка, ТТ, нові ТТ, сортування спаданням", () => {
    // lvivska (2000) > volynska (1500) > без області (300)
    expect(agg.byRegion.map((r) => r.regionSlug)).toEqual([
      "lvivska",
      "volynska",
      null,
    ]);
    const lviv = agg.byRegion[0]!;
    expect(lviv.revenueUah).toBe(2000);
    expect(lviv.ttCount).toBe(1);
    expect(lviv.newTtCount).toBe(1);
    const volyn = agg.byRegion[1]!;
    expect(volyn.revenueUah).toBe(1500);
    expect(volyn.ttCount).toBe(1); // c1 двічі → один ТТ
    expect(volyn.newTtCount).toBe(0);
    expect(agg.byRegion[2]!.regionLabel).toBe("Без області");
  });

  it("по клієнтах: агрегує повтори одного клієнта, isNew", () => {
    const c1 = agg.byClient.find((c) => c.customerId === "c1")!;
    expect(c1.revenueUah).toBe(1500);
    expect(c1.isNew).toBe(false);
    const c2 = agg.byClient.find((c) => c.customerId === "c2")!;
    expect(c2.isNew).toBe(true);
  });
});

describe("comparePeriods (спрацювання ТТ)", () => {
  const current = aggregatePeriod(
    [row("a", "volynska", 100, 2), row("b", "volynska", 100, 2)],
    new Set(),
  );
  const previous = aggregatePeriod(
    [row("b", "volynska", 100, 2), row("c", "volynska", 100, 2)],
    new Set(),
  );
  const cmp = comparePeriods(current, previous);

  it("gained = у поточному, не в порівняльному (a)", () => {
    expect(cmp.gained.map((c) => c.customerId)).toEqual(["a"]);
    expect(cmp.gainedCount).toBe(1);
  });

  it("lost = у порівняльному, не в поточному (c) — «вилетіли»", () => {
    expect(cmp.lost.map((c) => c.customerId)).toEqual(["c"]);
    expect(cmp.lostCount).toBe(1);
  });

  it("stable = в обох (b)", () => {
    expect(cmp.stableCount).toBe(1);
  });
});
