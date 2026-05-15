import { describe, it, expect } from "vitest";
import {
  ORDER_STATUS_LIST,
  ORDER_STATUS_META,
  getOrderStatusMeta,
} from "./order-status";

describe("order-status", () => {
  it("returns meta for known status", () => {
    const m = getOrderStatusMeta("delivered");
    expect(m).toEqual(ORDER_STATUS_META.delivered);
    expect(m.label).toBe("Доставлено");
  });

  it("falls back to raw status with gray color for unknown", () => {
    const m = getOrderStatusMeta("unknown_status");
    expect(m.label).toBe("unknown_status");
    expect(m.color).toBe("gray");
  });

  it("contains all 6 documented statuses", () => {
    expect(ORDER_STATUS_LIST).toEqual([
      "draft",
      "pending",
      "approved",
      "shipped",
      "delivered",
      "cancelled",
    ]);
  });
});
