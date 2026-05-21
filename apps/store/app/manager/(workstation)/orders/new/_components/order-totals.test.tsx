import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrderTotals } from "./order-totals";
import type { OrderItemDraft } from "./types";

afterEach(() => cleanup());

function draft(overrides: Partial<OrderItemDraft> = {}): OrderItemDraft {
  return {
    uid: Math.random().toString(),
    product: null,
    lot: null,
    bindToLot: false,
    weight: 0,
    quantity: 1,
    priceEur: 0,
    ...overrides,
  };
}

describe("OrderTotals", () => {
  it("показує 0 для порожнього списку", () => {
    render(<OrderTotals items={[]} exchangeRate={43} />);
    expect(screen.getByText(/0 €/)).toBeDefined();
    expect(screen.getByText(/курс EUR→UAH: 43.00/)).toBeDefined();
  });

  it("сумує priceEur через items + multiply by rate", () => {
    const items = [
      draft({
        priceEur: 100,
        product: {
          id: "p1",
          code1C: null,
          articleCode: null,
          name: "P1",
          slug: "p1",
          priceUnit: "kg",
          averageWeight: null,
          inStock: true,
          prices: [],
        },
      }),
      draft({
        priceEur: 50,
        product: {
          id: "p2",
          code1C: null,
          articleCode: null,
          name: "P2",
          slug: "p2",
          priceUnit: "kg",
          averageWeight: null,
          inStock: true,
          prices: [],
        },
      }),
    ];
    render(<OrderTotals items={items} exchangeRate={43} />);
    expect(screen.getByText("150.00 €")).toBeDefined();
    // 150 * 43 = 6450
    expect(screen.getByText(/6\s?450 ₴/)).toBeDefined();
  });

  it("ігнорує items без product при рахунку 'позиції'", () => {
    const items = [
      draft({ priceEur: 0 }),
      draft({
        priceEur: 10,
        product: {
          id: "p1",
          code1C: null,
          articleCode: null,
          name: "P1",
          slug: "p1",
          priceUnit: "kg",
          averageWeight: null,
          inStock: true,
          prices: [],
        },
      }),
    ];
    render(<OrderTotals items={items} exchangeRate={40} />);
    expect(screen.getByText(/^1 позиція/)).toBeDefined();
  });
});
