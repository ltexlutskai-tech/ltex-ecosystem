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
    expect(getSaleStatusMeta("posted").color).toBe("green");
  });

  it("fallback для невідомого статусу", () => {
    const meta = getSaleStatusMeta("weird");
    expect(meta.label).toBe("weird");
    expect(meta.color).toBe("gray");
  });
});

describe("status lists", () => {
  it("SALE_STATUS_LIST + MANAGER_SALE_STATUSES = 4 канонічні", () => {
    expect(SALE_STATUS_LIST).toEqual(["draft", "sent", "posted", "cancelled"]);
    expect([...MANAGER_SALE_STATUSES]).toEqual([
      "draft",
      "sent",
      "posted",
      "cancelled",
    ]);
  });

  it("isManagerSaleStatus розрізняє канонічні / ні", () => {
    expect(isManagerSaleStatus("draft")).toBe(true);
    expect(isManagerSaleStatus("delivered")).toBe(false);
  });
});

describe("isSaleLocked / canEditSale", () => {
  it("posted заблоковано", () => {
    expect(isSaleLocked("posted")).toBe(true);
    expect(canEditSale("posted")).toBe(false);
  });

  it("cancelled — лише перегляд", () => {
    expect(isSaleLocked("cancelled")).toBe(false);
    expect(canEditSale("cancelled")).toBe(false);
  });

  it("draft / sent редагуються", () => {
    expect(canEditSale("draft")).toBe(true);
    expect(canEditSale("sent")).toBe(true);
  });
});

describe("transitions graph", () => {
  it("draft → sent / posted / cancelled", () => {
    expect(getAllowedSaleTransitions("draft")).toEqual([
      "sent",
      "posted",
      "cancelled",
    ]);
  });

  it("sent → draft / posted / cancelled", () => {
    expect(getAllowedSaleTransitions("sent")).toEqual([
      "draft",
      "posted",
      "cancelled",
    ]);
  });

  it("posted — фінальний (немає переходів)", () => {
    expect(getAllowedSaleTransitions("posted")).toEqual([]);
  });

  it("cancelled → draft", () => {
    expect(getAllowedSaleTransitions("cancelled")).toEqual(["draft"]);
  });

  it("невідомий статус трактується як draft", () => {
    expect(getAllowedSaleTransitions("???")).toEqual([
      "sent",
      "posted",
      "cancelled",
    ]);
  });

  it("isSaleTransitionAllowed: дозволені / заборонені", () => {
    expect(isSaleTransitionAllowed("draft", "sent")).toBe(true);
    // «Зберегти та провести» — draft/sent → posted дозволено.
    expect(isSaleTransitionAllowed("draft", "posted")).toBe(true);
    expect(isSaleTransitionAllowed("sent", "posted")).toBe(true);
    expect(isSaleTransitionAllowed("posted", "draft")).toBe(false);
    expect(isSaleTransitionAllowed("cancelled", "posted")).toBe(false);
    expect(isSaleTransitionAllowed("draft", "delivered")).toBe(false);
  });
});
