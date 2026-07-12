import { describe, it, expect, vi } from "vitest";

vi.mock("@ltex/db", () => ({ prisma: {} }));

import { buildStockMovementRows } from "./stock-movement-hooks";
import type { StockDocKind } from "./stock-documents";

const occurredAt = new Date("2026-06-17T00:00:00Z");

function doc(
  items: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
) {
  return {
    id: "DOC1",
    occurredAt,
    warehouseId: "WH",
    fromWarehouseId: null,
    toWarehouseId: null,
    items: items.map((i, idx) => ({
      id: `it${idx}`,
      productId: "P1",
      charHex: null,
      barcode: null,
      weight: 10,
      quantity: 5,
      ...i,
    })),
    ...extra,
  } as Parameters<typeof buildStockMovementRows>[1];
}

const codes = new Map([["P1", "CODE-P1"]]);

function run(
  kind: StockDocKind,
  d: Parameters<typeof buildStockMovementRows>[1],
) {
  return buildStockMovementRows(kind, d, codes);
}

describe("buildStockMovementRows — signs per document type", () => {
  it("write-offs → розхід (recordKind=1)", () => {
    const rows = run("write-offs", doc([{}]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recordKind).toBe(1);
    expect(rows[0]?.productCode1C).toBe("CODE-P1");
    expect(rows[0]?.qty).toBe(5);
  });

  it("warehouse-returns → розхід (1)", () => {
    expect(run("warehouse-returns", doc([{}]))[0]?.recordKind).toBe(1);
  });

  it("supplier-returns → розхід (1)", () => {
    expect(run("supplier-returns", doc([{}]))[0]?.recordKind).toBe(1);
  });

  it("product-returns → прихід (0)", () => {
    expect(run("product-returns", doc([{}]))[0]?.recordKind).toBe(0);
  });

  it("stock-adjustments → прихід (0)", () => {
    expect(run("stock-adjustments", doc([{}]))[0]?.recordKind).toBe(0);
  });

  it("repackings: disassembled → розхід, assembled → прихід", () => {
    const rows = run(
      "repackings",
      doc([{ role: "disassembled" }, { role: "assembled" }]),
    );
    expect(rows[0]?.recordKind).toBe(1);
    expect(rows[1]?.recordKind).toBe(0);
  });

  it("inventories: документ звірки — рухів складу НЕ пише", () => {
    const rows = run(
      "inventories",
      doc([
        { qtyAccounting: 3, qtyActual: 5, qtyDifference: 2 }, // надлишок
        { qtyAccounting: 8, qtyActual: 5, qtyDifference: -3 }, // нестача
        { qtyAccounting: 4, qtyActual: 4, qtyDifference: 0 }, // збіг
      ]),
    );
    // Коригування залишків роблять окремі документи (Списання / Оприбуткування).
    expect(rows).toHaveLength(0);
  });

  it("stock-transfers: два рухи на рядок (відправник розхід + одержувач прихід)", () => {
    const rows = run(
      "stock-transfers",
      doc([{}], { fromWarehouseId: "WH-A", toWarehouseId: "WH-B" }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.recordKind).toBe(1);
    expect(rows[0]?.warehouseCode1C).toBe("WH-A");
    expect(rows[1]?.recordKind).toBe(0);
    expect(rows[1]?.warehouseCode1C).toBe("WH-B");
  });
});

describe("buildStockMovementRows — productCode1C resolution", () => {
  it("резолвить через Product.code1C", () => {
    expect(run("write-offs", doc([{}]))[0]?.productCode1C).toBe("CODE-P1");
  });

  it("fallback на barcode коли немає code1C", () => {
    const rows = run(
      "write-offs",
      doc([{ productId: "UNKNOWN", barcode: "BC-1" }]),
    );
    expect(rows[0]?.productCode1C).toBe("BC-1");
  });

  it("fallback на синтетичний ключ за id рядка", () => {
    const rows = run(
      "write-offs",
      doc([{ productId: null, barcode: null, charHex: null }]),
    );
    expect(rows[0]?.productCode1C).toMatch(/^doc-item:/);
  });
});

describe("buildStockMovementRows — lineNo / idempotency keys", () => {
  it("lineNo послідовний (1,2,3) для унікальності ключа", () => {
    const rows = run("write-offs", doc([{}, {}, {}]));
    expect(rows.map((r) => r.lineNo)).toEqual([1, 2, 3]);
  });

  it("stock-transfers дає окремі lineNo для розходу та приходу", () => {
    const rows = run(
      "stock-transfers",
      doc([{}], { fromWarehouseId: "A", toWarehouseId: "B" }),
    );
    expect(rows.map((r) => r.lineNo)).toEqual([1, 2]);
  });
});
