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
    expect(m.label).toBe("Проведено");
  });

  it("new statuses have labels", () => {
    expect(getOrderStatusMeta("not_posted").label).toBe("Не проведено");
    expect(getOrderStatusMeta("pending").label).toBe("Очікує підтвердження");
    expect(getOrderStatusMeta("draft").label).toBe("Чернетка");
  });

  it("closed status has label «Закрите» (red)", () => {
    const m = getOrderStatusMeta("closed");
    expect(m.label).toBe("Закрите");
    expect(m.color).toBe("red");
  });

  it("legacy status shows a readable label (historical display only)", () => {
    expect(getOrderStatusMeta("cancelled").label).toBe("Скасовано");
    expect(getOrderStatusMeta("shipped").label).toBe("Відвантажено");
  });

  it("falls back to raw status with gray color for truly unknown", () => {
    const m = getOrderStatusMeta("unknown_status");
    expect(m.label).toBe("unknown_status");
    expect(m.color).toBe("gray");
  });

  it("filter list = 4 canonical + closed (no legacy)", () => {
    expect(ORDER_STATUS_LIST).toEqual([
      "draft",
      "not_posted",
      "posted",
      "pending",
      "closed",
    ]);
    expect(ORDER_STATUS_LIST).not.toContain("cancelled");
    expect(ORDER_STATUS_LIST).not.toContain("sent");
  });

  it("MANAGER_ORDER_STATUSES — the 4 canonical (closed is NOT selectable)", () => {
    expect(MANAGER_ORDER_STATUSES).toEqual([
      "draft",
      "not_posted",
      "posted",
      "pending",
    ]);
    expect(MANAGER_ORDER_STATUSES).not.toContain("closed");
  });
});

describe("isManagerOrderStatus", () => {
  it("true for canonical statuses", () => {
    expect(isManagerOrderStatus("draft")).toBe(true);
    expect(isManagerOrderStatus("not_posted")).toBe(true);
    expect(isManagerOrderStatus("pending")).toBe(true);
    expect(isManagerOrderStatus("posted")).toBe(true);
  });
  it("false for legacy / unknown / closed", () => {
    expect(isManagerOrderStatus("cancelled")).toBe(false);
    expect(isManagerOrderStatus("sent")).toBe(false);
    expect(isManagerOrderStatus("nope")).toBe(false);
    // «closed» — не менеджерський (не ціль переходу, ставиться формою закриття).
    expect(isManagerOrderStatus("closed")).toBe(false);
  });
});

describe("isOrderLocked / canEditOrder", () => {
  it("posted редагується лише поки «Актуальне»", () => {
    expect(isOrderLocked("posted")).toBe(true);
    expect(canEditOrder("posted", true)).toBe(true);
    expect(canEditOrder("posted", false)).toBe(false);
  });
  it("draft / not_posted / pending are editable", () => {
    expect(canEditOrder("draft")).toBe(true);
    expect(canEditOrder("not_posted")).toBe(true);
    expect(canEditOrder("pending")).toBe(true);
    expect(isOrderLocked("draft")).toBe(false);
  });
  it("legacy status editable (treated as draft)", () => {
    expect(canEditOrder("cancelled")).toBe(true);
    expect(isOrderLocked("cancelled")).toBe(false);
  });
});

describe("status transitions", () => {
  it("draft → not_posted / posted", () => {
    expect(getAllowedStatusTransitions("draft")).toEqual([
      "not_posted",
      "posted",
    ]);
  });
  it("not_posted → posted / draft", () => {
    expect(getAllowedStatusTransitions("not_posted")).toEqual([
      "posted",
      "draft",
    ]);
  });
  it("pending → not_posted / posted", () => {
    expect(getAllowedStatusTransitions("pending")).toEqual([
      "not_posted",
      "posted",
    ]);
  });
  it("posted is final — no transitions", () => {
    expect(getAllowedStatusTransitions("posted")).toEqual([]);
  });
  it("legacy status treated as draft for transitions", () => {
    expect(getAllowedStatusTransitions("cancelled")).toEqual([
      "not_posted",
      "posted",
    ]);
  });

  it("isTransitionAllowed honours the graph", () => {
    expect(isTransitionAllowed("draft", "not_posted")).toBe(true);
    expect(isTransitionAllowed("draft", "posted")).toBe(true);
    expect(isTransitionAllowed("pending", "posted")).toBe(true);
    expect(isTransitionAllowed("pending", "not_posted")).toBe(true);
    expect(isTransitionAllowed("not_posted", "posted")).toBe(true);
    // posted — фінальний.
    expect(isTransitionAllowed("posted", "draft")).toBe(false);
    // removed status is not a valid target.
    expect(isTransitionAllowed("draft", "cancelled")).toBe(false);
    expect(isTransitionAllowed("draft", "bogus")).toBe(false);
  });
});
