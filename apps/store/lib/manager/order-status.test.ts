import { describe, it, expect } from "vitest";
import {
  ORDER_STATUS_LIST,
  ORDER_STATUS_META,
  MANAGER_ORDER_STATUSES,
  getOrderStatusMeta,
  isManagerOrderStatus,
  isOrderLocked,
  canEditOrder,
  getAllowedStatusTransitions,
  isTransitionAllowed,
} from "./order-status";

describe("order-status meta", () => {
  it("returns meta for known status", () => {
    const m = getOrderStatusMeta("posted");
    expect(m).toEqual(ORDER_STATUS_META.posted);
    expect(m.label).toBe("Проведено (архів)");
  });

  it("falls back to raw status with gray color for unknown", () => {
    const m = getOrderStatusMeta("unknown_status");
    expect(m.label).toBe("unknown_status");
    expect(m.color).toBe("gray");
  });

  it("contains the 4 canonical statuses + legacy ones", () => {
    expect(ORDER_STATUS_LIST).toContain("draft");
    expect(ORDER_STATUS_LIST).toContain("sent");
    expect(ORDER_STATUS_LIST).toContain("posted");
    expect(ORDER_STATUS_LIST).toContain("cancelled");
    // legacy preserved for back-compat display
    expect(ORDER_STATUS_LIST).toContain("delivered");
  });

  it("MANAGER_ORDER_STATUSES — exactly 4 canonical", () => {
    expect(MANAGER_ORDER_STATUSES).toEqual([
      "draft",
      "sent",
      "posted",
      "cancelled",
    ]);
  });
});

describe("isManagerOrderStatus", () => {
  it("true for canonical statuses", () => {
    expect(isManagerOrderStatus("draft")).toBe(true);
    expect(isManagerOrderStatus("posted")).toBe(true);
  });
  it("false for legacy / unknown", () => {
    expect(isManagerOrderStatus("delivered")).toBe(false);
    expect(isManagerOrderStatus("nope")).toBe(false);
  });
});

describe("isOrderLocked / canEditOrder", () => {
  it("posted is locked and not editable", () => {
    expect(isOrderLocked("posted")).toBe(true);
    expect(canEditOrder("posted")).toBe(false);
  });
  it("cancelled is not locked but not editable", () => {
    expect(isOrderLocked("cancelled")).toBe(false);
    expect(canEditOrder("cancelled")).toBe(false);
  });
  it("draft and sent are editable", () => {
    expect(canEditOrder("draft")).toBe(true);
    expect(canEditOrder("sent")).toBe(true);
  });
  it("legacy status editable (treated as draft)", () => {
    expect(canEditOrder("delivered")).toBe(true);
    expect(isOrderLocked("delivered")).toBe(false);
  });
});

describe("status transitions", () => {
  it("draft → sent / posted / cancelled", () => {
    expect(getAllowedStatusTransitions("draft")).toEqual([
      "sent",
      "posted",
      "cancelled",
    ]);
  });
  it("sent → draft / posted / cancelled", () => {
    expect(getAllowedStatusTransitions("sent")).toEqual([
      "draft",
      "posted",
      "cancelled",
    ]);
  });
  it("posted is final — no transitions", () => {
    expect(getAllowedStatusTransitions("posted")).toEqual([]);
  });
  it("cancelled → draft (return to work)", () => {
    expect(getAllowedStatusTransitions("cancelled")).toEqual(["draft"]);
  });
  it("legacy status treated as draft for transitions", () => {
    expect(getAllowedStatusTransitions("delivered")).toEqual([
      "sent",
      "posted",
      "cancelled",
    ]);
  });

  it("isTransitionAllowed honours the graph", () => {
    expect(isTransitionAllowed("draft", "sent")).toBe(true);
    expect(isTransitionAllowed("sent", "draft")).toBe(true);
    expect(isTransitionAllowed("draft", "cancelled")).toBe(true);
    // «Зберегти та провести» — draft/sent → posted дозволено.
    expect(isTransitionAllowed("draft", "posted")).toBe(true);
    expect(isTransitionAllowed("sent", "posted")).toBe(true);
    // posted — фінальний; cancelled → posted заборонено.
    expect(isTransitionAllowed("posted", "draft")).toBe(false);
    expect(isTransitionAllowed("cancelled", "posted")).toBe(false);
    expect(isTransitionAllowed("draft", "delivered")).toBe(false);
    expect(isTransitionAllowed("draft", "bogus")).toBe(false);
  });
});
