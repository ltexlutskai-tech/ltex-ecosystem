import { describe, it, expect } from "vitest";
import {
  unitPriceForType,
  recalcLinePrice,
  type PriceEntry,
} from "./order-pricing";

const prices: PriceEntry[] = [
  { priceType: "wholesale", amount: 4 },
  { priceType: "small_wholesale", amount: 5 },
  { priceType: "retail", amount: 7 },
];

describe("unitPriceForType", () => {
  it("повертає точний збіг по коду типу цін", () => {
    expect(unitPriceForType(prices, "small_wholesale")).toBe(5);
    expect(unitPriceForType(prices, "retail")).toBe(7);
  });

  it("fallback на wholesale коли точного типу немає", () => {
    expect(unitPriceForType(prices, "unknown_type")).toBe(4);
  });

  it("fallback на wholesale коли тип не передано", () => {
    expect(unitPriceForType(prices, null)).toBe(4);
    expect(unitPriceForType(prices, undefined)).toBe(4);
    expect(unitPriceForType(prices, "")).toBe(4);
  });

  it("fallback на першу наявну коли wholesale відсутня", () => {
    const noBase: PriceEntry[] = [
      { priceType: "retail", amount: 7 },
      { priceType: "small_wholesale", amount: 5 },
    ];
    expect(unitPriceForType(noBase, "missing")).toBe(7);
  });

  it("повертає null коли цін немає взагалі", () => {
    expect(unitPriceForType([], "wholesale")).toBeNull();
  });
});

describe("recalcLinePrice", () => {
  it("total = одинична × вага", () => {
    // wholesale=4 × 25кг = 100
    expect(recalcLinePrice(prices, "wholesale", 25)).toBe(100);
    // retail=7 × 10кг = 70
    expect(recalcLinePrice(prices, "retail", 10)).toBe(70);
  });

  it("округлює до копійок", () => {
    const p: PriceEntry[] = [{ priceType: "wholesale", amount: 4.333 }];
    expect(recalcLinePrice(p, "wholesale", 3)).toBe(13);
  });

  it("повертає fallback коли цін немає (не обнуляє ручний ввід)", () => {
    expect(recalcLinePrice([], "wholesale", 25, 99)).toBe(99);
  });

  it("при вазі 0 повертає 0 (за наявності прайсу)", () => {
    expect(recalcLinePrice(prices, "wholesale", 0)).toBe(0);
    expect(recalcLinePrice(prices, "wholesale", -5)).toBe(0);
  });
});
