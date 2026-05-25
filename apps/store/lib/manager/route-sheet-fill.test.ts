import { describe, it, expect } from "vitest";
import {
  aggregateItemsFromOrders,
  computeRouteSheetTotals,
  type OrderItemForAggregation,
} from "./route-sheet-fill";

describe("aggregateItemsFromOrders", () => {
  it("maps order items to RouteSheetItem shape (sum=priceEur, price=sum/qty)", () => {
    const items: OrderItemForAggregation[] = [
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: null,
        priceEur: 40,
        weight: 10,
        quantity: 2,
      },
    ];
    const out = aggregateItemsFromOrders(items);
    expect(out).toHaveLength(1);
    expect(out[0]?.sum).toBe(40);
    expect(out[0]?.quantity).toBe(2);
    expect(out[0]?.price).toBe(20); // 40 / 2
    expect(out[0]?.quantityLoaded).toBe(0);
    expect(out[0]?.orderId).toBe("o1");
    expect(out[0]?.customerId).toBe("c1");
  });

  it("groups identical (order+product+lot) lines, sums qty & sum", () => {
    const items: OrderItemForAggregation[] = [
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: null,
        priceEur: 30,
        weight: 10,
        quantity: 1,
      },
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: null,
        priceEur: 30,
        weight: 10,
        quantity: 1,
      },
    ];
    const out = aggregateItemsFromOrders(items);
    expect(out).toHaveLength(1);
    expect(out[0]?.quantity).toBe(2);
    expect(out[0]?.sum).toBe(60);
    expect(out[0]?.price).toBe(30);
  });

  it("keeps lines of different orders / products / lots separate", () => {
    const items: OrderItemForAggregation[] = [
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: "l1",
        priceEur: 10,
        weight: 5,
        quantity: 1,
      },
      {
        orderId: "o1",
        customerId: "c1",
        productId: "p1",
        lotId: "l2",
        priceEur: 12,
        weight: 6,
        quantity: 1,
      },
      {
        orderId: "o2",
        customerId: "c2",
        productId: "p1",
        lotId: null,
        priceEur: 8,
        weight: 4,
        quantity: 1,
      },
    ];
    const out = aggregateItemsFromOrders(items);
    expect(out).toHaveLength(3);
  });

  it("handles zero quantity without dividing by zero", () => {
    const out = aggregateItemsFromOrders([
      {
        orderId: "o1",
        customerId: null,
        productId: "p1",
        lotId: null,
        priceEur: 0,
        weight: 0,
        quantity: 0,
      },
    ]);
    expect(out[0]?.price).toBe(0);
    expect(out[0]?.sum).toBe(0);
  });
});

describe("computeRouteSheetTotals", () => {
  it("totalEur = Σ sum; totalUah = round(totalEur × rate)", () => {
    const t = computeRouteSheetTotals([{ sum: 40 }, { sum: 60 }], 43.5);
    expect(t.totalEur).toBe(100);
    expect(t.totalUah).toBe(4350);
  });

  it("rounds totalUah", () => {
    const t = computeRouteSheetTotals([{ sum: 10.1 }], 43);
    expect(t.totalUah).toBe(434); // round(434.3)
  });
});
