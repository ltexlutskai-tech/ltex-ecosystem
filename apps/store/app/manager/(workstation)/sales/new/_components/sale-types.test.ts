import { describe, it, expect } from "vitest";
import { draftToWire, lineTotalEur, type SaleItemDraft } from "./sale-types";

function draft(over: Partial<SaleItemDraft> = {}): SaleItemDraft {
  return {
    uid: "u1",
    product: {
      id: "p1",
      code1C: null,
      articleCode: null,
      name: "Test",
      slug: "test",
      priceUnit: "kg",
      averageWeight: 20,
      inStock: true,
      prices: [],
    },
    lotId: null,
    barcode: null,
    quantity: 1,
    weight: 10,
    pricePerKg: 4,
    priceEur: 40,
    ...over,
  };
}

describe("lineTotalEur", () => {
  it("= ціна/кг × вага × мішки (округлення до копійок)", () => {
    expect(lineTotalEur(2.5, 25, 1)).toBe(62.5);
    expect(lineTotalEur(2, 10, 3)).toBe(60);
  });

  it("округлює до копійок", () => {
    expect(lineTotalEur(2.333, 10, 1)).toBe(23.33);
  });
});

describe("draftToWire", () => {
  it("повертає null для рядка без товару", () => {
    expect(draftToWire(draft({ product: null }))).toBeNull();
  });

  it("зберігає lotId + barcode (скан ШК) — на відміну від замовлення", () => {
    const wire = draftToWire(
      draft({ lotId: "lot9", barcode: "B9", quantity: 2, weight: 20 }),
    );
    expect(wire).not.toBeNull();
    expect(wire?.lotId).toBe("lot9");
    expect(wire?.barcode).toBe("B9");
    expect(wire?.pricePerKg).toBe(4);
    expect(wire?.quantity).toBe(2);
    expect(wire?.weight).toBe(20);
    expect(wire?.priceEur).toBe(40);
  });

  it("загальна позиція — lotId/barcode null", () => {
    const wire = draftToWire(draft());
    expect(wire?.lotId).toBeNull();
    expect(wire?.barcode).toBeNull();
  });
});
