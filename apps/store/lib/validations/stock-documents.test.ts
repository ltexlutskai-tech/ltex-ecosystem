import { describe, it, expect } from "vitest";
import { productReturnSchema, repackingSchema, inventorySchema, writeOffSchema } from "./stock-documents";

describe("productReturnSchema", () => {
  it("accepts minimal payload with coerced date", () => {
    const r = productReturnSchema.safeParse({ docDate: "2026-06-17", customerName: "ТТ Іваненко", items: [{ productId: "p1", weight: 20, quantity: 1, priceEur: 1.5 }] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.docDate).toBeInstanceOf(Date);
      expect(r.data.items).toHaveLength(1);
    }
  });
  it("defaults empty items array", () => {
    const r = productReturnSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items).toEqual([]);
  });
  it("rejects negative weight", () => {
    expect(productReturnSchema.safeParse({ items: [{ weight: -1 }] }).success).toBe(false);
  });
});

describe("repackingSchema", () => {
  it("accepts disassembled/assembled roles", () => {
    expect(repackingSchema.safeParse({ items: [{ role: "disassembled", weight: 50 }, { role: "assembled", weight: 48 }] }).success).toBe(true);
  });
  it("rejects invalid role", () => {
    expect(repackingSchema.safeParse({ items: [{ role: "nope", weight: 1 }] }).success).toBe(false);
  });
});

describe("inventorySchema", () => {
  it("accepts accounting/actual quantities", () => {
    expect(inventorySchema.safeParse({ items: [{ qtyAccounting: 100, qtyActual: 97 }] }).success).toBe(true);
  });
});

describe("writeOffSchema", () => {
  it("accepts optional reason", () => {
    expect(writeOffSchema.safeParse({ reason: "Некондиція", items: [{ weight: 5, priceEur: 2 }] }).success).toBe(true);
  });
});
