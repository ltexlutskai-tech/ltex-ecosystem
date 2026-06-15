import { describe, it, expect } from "vitest";
import {
  aggregateOrdered,
  aggregateAvailable,
  computeNeeded,
  unitForPriceUnit,
  type OrderedItemInput,
  type AvailableLotInput,
} from "./needs";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("unitForPriceUnit", () => {
  it("maps priceUnit → display unit", () => {
    expect(unitForPriceUnit("kg")).toBe("кг");
    expect(unitForPriceUnit("piece")).toBe("шт");
    expect(unitForPriceUnit("pair")).toBe("пар");
    expect(unitForPriceUnit(null)).toBe("кг");
    expect(unitForPriceUnit(undefined)).toBe("кг");
  });
});

describe("aggregateOrdered", () => {
  it("sums weight for kg-products and quantity for piece/pair", () => {
    const items: OrderedItemInput[] = [
      { productId: "kg1", weight: 10, quantity: 3 },
      { productId: "kg1", weight: 5, quantity: 2 },
      { productId: "shoe1", weight: 2, quantity: 4 },
      { productId: "shoe1", weight: 1, quantity: 6 },
    ];
    const units = new Map<string, string>([
      ["kg1", "kg"],
      ["shoe1", "pair"],
    ]);
    const out = aggregateOrdered(items, units);
    expect(out.get("kg1")).toBe(15); // 10 + 5 (weight)
    expect(out.get("shoe1")).toBe(10); // 4 + 6 (quantity)
  });

  it("defaults unknown priceUnit to weight (kg)", () => {
    const out = aggregateOrdered(
      [{ productId: "p", weight: 7, quantity: 99 }],
      new Map(),
    );
    expect(out.get("p")).toBe(7);
  });

  it("returns empty map for empty input", () => {
    expect(aggregateOrdered([], new Map()).size).toBe(0);
  });
});

describe("aggregateAvailable", () => {
  const units = new Map<string, string>([
    ["kg1", "kg"],
    ["shoe1", "piece"],
  ]);

  it("sums free lots only (weight vs quantity by unit)", () => {
    const lots: AvailableLotInput[] = [
      {
        productId: "kg1",
        status: "free",
        weight: 20,
        quantity: 1,
        reservedUntil: null,
        reservedByUserId: null,
      },
      {
        productId: "kg1",
        status: "free",
        weight: 5,
        quantity: 1,
        reservedUntil: null,
        reservedByUserId: null,
      },
      {
        productId: "shoe1",
        status: "free",
        weight: 3,
        quantity: 8,
        reservedUntil: null,
        reservedByUserId: null,
      },
    ];
    const out = aggregateAvailable(lots, units, NOW);
    expect(out.get("kg1")).toBe(25); // 20 + 5 (weight)
    expect(out.get("shoe1")).toBe(8); // quantity
  });

  it("excludes non-free lots and actively reserved lots", () => {
    const future = new Date(NOW.getTime() + 86_400_000);
    const past = new Date(NOW.getTime() - 86_400_000);
    const lots: AvailableLotInput[] = [
      {
        productId: "kg1",
        status: "sold",
        weight: 100,
        quantity: 1,
        reservedUntil: null,
        reservedByUserId: null,
      },
      {
        productId: "kg1",
        status: "free",
        weight: 50,
        quantity: 1,
        reservedUntil: future, // active reservation → excluded
        reservedByUserId: "u1",
      },
      {
        productId: "kg1",
        status: "free",
        weight: 8,
        quantity: 1,
        reservedUntil: past, // expired reservation → counts
        reservedByUserId: "u1",
      },
    ];
    const out = aggregateAvailable(lots, units, NOW);
    expect(out.get("kg1")).toBe(8);
  });
});

describe("computeNeeded", () => {
  it("deficit when ordered > available", () => {
    expect(computeNeeded(15, 10)).toBe(5);
  });
  it("zero when available >= ordered", () => {
    expect(computeNeeded(10, 10)).toBe(0);
    expect(computeNeeded(8, 20)).toBe(0);
  });
});
