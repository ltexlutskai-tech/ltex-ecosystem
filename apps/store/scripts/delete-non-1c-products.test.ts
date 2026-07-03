import { describe, it, expect } from "vitest";

import {
  classifyProduct,
  type ProductClassInput,
} from "./delete-non-1c-products";

function input(overrides: Partial<ProductClassInput> = {}): ProductClassInput {
  return {
    code1C: null,
    orderItemCount: 0,
    saleItemCount: 0,
    receivingItemCount: 0,
    ...overrides,
  };
}

describe("classifyProduct — чиста класифікація не-1С товарів", () => {
  it("code1C != null → keep1C (незалежно від історії)", () => {
    expect(
      classifyProduct(
        input({ code1C: "abc123", orderItemCount: 5, receivingItemCount: 2 }),
      ),
    ).toEqual({ bucket: "keep1C", hiddenDueToReceivingOnly: false });
  });

  it("code1C = null і жодних посилань → deleteFull", () => {
    expect(classifyProduct(input())).toEqual({
      bucket: "deleteFull",
      hiddenDueToReceivingOnly: false,
    });
  });

  it("порожній рядок code1C трактуємо як не-1С → deleteFull", () => {
    expect(classifyProduct(input({ code1C: "" })).bucket).toBe("deleteFull");
  });

  it("є OrderItem → hideHistory (не через ReceivingItem)", () => {
    expect(classifyProduct(input({ orderItemCount: 1 }))).toEqual({
      bucket: "hideHistory",
      hiddenDueToReceivingOnly: false,
    });
  });

  it("є SaleItem → hideHistory", () => {
    expect(classifyProduct(input({ saleItemCount: 3 })).bucket).toBe(
      "hideHistory",
    );
  });

  it("є лише ReceivingItem (без продажів) → hideHistory + прапор receivingOnly", () => {
    expect(classifyProduct(input({ receivingItemCount: 2 }))).toEqual({
      bucket: "hideHistory",
      hiddenDueToReceivingOnly: true,
    });
  });

  it("є і продажі, і ReceivingItem → hideHistory, але receivingOnly=false", () => {
    expect(
      classifyProduct(input({ saleItemCount: 1, receivingItemCount: 4 })),
    ).toEqual({ bucket: "hideHistory", hiddenDueToReceivingOnly: false });
  });
});
