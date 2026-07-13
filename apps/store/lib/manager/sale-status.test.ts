import { describe, it, expect } from "vitest";
import {
  getSaleStatusMeta,
  isManagerSaleStatus,
  isSaleLocked,
  canEditSale,
  getAllowedSaleTransitions,
  isSaleTransitionAllowed,
  SALE_STATUS_LIST,
  MANAGER_SALE_STATUSES,
} from "./sale-status";

describe("getSaleStatusMeta", () => {
  it("повертає label/color для відомих статусів", () => {
    expect(getSaleStatusMeta("draft").label).toBe("Чернетка");
    expect(getSaleStatusMeta("not_posted").label).toBe("Не проведено");
    expect(getSaleStatusMeta("posted").color).toBe("green");
  });

  it("легасі статуси показуються читабельно (не у allow-list)", () => {
    expect(getSaleStatusMeta("sent").label).toBe("Відправлено в 1С");
    expect(getSaleStatusMeta("cancelled").label).toBe("Скасовано");
    expect(getSaleStatusMeta("delivered").label).toBe("Доставлено");
  });

  it("fallback для невідомого статусу", () => {
    const meta = getSaleStatusMeta("weird");
    expect(meta.label).toBe("weird");
    expect(meta.color).toBe("gray");
  });
});

describe("status lists", () => {
  it("SALE_STATUS_LIST + MANAGER_SALE_STATUSES канонічні (4, як у замовленнях)", () => {
    expect(SALE_STATUS_LIST).toEqual([
      "draft",
      "not_posted",
      "posted",
      "pending",
    ]);
    expect([...MANAGER_SALE_STATUSES]).toEqual([
      "draft",
      "not_posted",
      "posted",
      "pending",
    ]);
  });

  it("pending — «Очікує підтвердження», редагується, не заблокований", () => {
    expect(getSaleStatusMeta("pending").label).toBe("Очікує підтвердження");
    expect(isSaleLocked("pending")).toBe(false);
    expect(canEditSale("pending")).toBe(true);
  });

  it("легасі sent/cancelled НЕ канонічні", () => {
    expect(isManagerSaleStatus("sent")).toBe(false);
    expect(isManagerSaleStatus("cancelled")).toBe(false);
  });

  it("isManagerSaleStatus розрізняє канонічні / ні", () => {
    expect(isManagerSaleStatus("draft")).toBe(true);
    expect(isManagerSaleStatus("not_posted")).toBe(true);
    expect(isManagerSaleStatus("delivered")).toBe(false);
  });
});

describe("isSaleLocked / canEditSale", () => {
  it("posted заблоковано", () => {
    expect(isSaleLocked("posted")).toBe(true);
    expect(canEditSale("posted")).toBe(false);
  });

  it("draft / not_posted / pending редагуються", () => {
    expect(canEditSale("draft")).toBe(true);
    expect(canEditSale("not_posted")).toBe(true);
    expect(canEditSale("pending")).toBe(true);
  });
});

describe("transitions graph", () => {
  it("draft → not_posted / posted", () => {
    expect(getAllowedSaleTransitions("draft")).toEqual([
      "not_posted",
      "posted",
    ]);
  });

  it("not_posted → posted / draft", () => {
    expect(getAllowedSaleTransitions("not_posted")).toEqual([
      "posted",
      "draft",
    ]);
  });

  it("pending → not_posted / posted", () => {
    expect(getAllowedSaleTransitions("pending")).toEqual([
      "not_posted",
      "posted",
    ]);
  });

  it("posted — фінальний (немає переходів)", () => {
    expect(getAllowedSaleTransitions("posted")).toEqual([]);
  });

  it("невідомий / легасі статус трактується як draft", () => {
    expect(getAllowedSaleTransitions("???")).toEqual(["not_posted", "posted"]);
    expect(getAllowedSaleTransitions("cancelled")).toEqual([
      "not_posted",
      "posted",
    ]);
  });

  it("isSaleTransitionAllowed: дозволені / заборонені", () => {
    expect(isSaleTransitionAllowed("draft", "not_posted")).toBe(true);
    // «Зберегти та провести» — draft/not_posted → posted дозволено.
    expect(isSaleTransitionAllowed("draft", "posted")).toBe(true);
    expect(isSaleTransitionAllowed("not_posted", "posted")).toBe(true);
    expect(isSaleTransitionAllowed("pending", "posted")).toBe(true);
    expect(isSaleTransitionAllowed("posted", "draft")).toBe(false);
    expect(isSaleTransitionAllowed("draft", "delivered")).toBe(false);
    expect(isSaleTransitionAllowed("draft", "cancelled")).toBe(false);
  });
});
