import { describe, it, expect, vi, beforeEach } from "vitest";

const { applyDebtMovementSafeMock } = vi.hoisted(() => ({
  applyDebtMovementSafeMock: vi.fn(),
}));

vi.mock("./debt-register", () => ({
  applyDebtMovementSafe: applyDebtMovementSafeMock,
  recomputeDebtForClients: vi.fn(),
}));
vi.mock("@ltex/db", () => ({ prisma: {} }));

import {
  nextDocNumber,
  docNumberPrefix,
  summarizeLines,
  getStockDocMeta,
  STOCK_DOCS,
  applyReturnFromCustomerDebt,
} from "./stock-documents";
import { normalizeLine, type NormLine } from "./stock-documents-repo";
import { isStockDocKind, parseCreateBody } from "./stock-documents-api";

beforeEach(() => applyDebtMovementSafeMock.mockReset());

describe("nextDocNumber", () => {
  it("starts at 0001 when empty", () => {
    expect(nextDocNumber("LT-RET-202606-", [])).toBe("LT-RET-202606-0001");
  });
  it("returns max+1 padded", () => {
    expect(
      nextDocNumber("LT-RET-202606-", [
        "LT-RET-202606-0001",
        "LT-RET-202606-0007",
        "LT-RET-202606-0003",
      ]),
    ).toBe("LT-RET-202606-0008");
  });
  it("ignores other prefixes", () => {
    expect(nextDocNumber("LT-RET-202606-", ["LT-WOF-202606-0009"])).toBe(
      "LT-RET-202606-0001",
    );
  });
});

describe("docNumberPrefix", () => {
  it("builds LT-<PREFIX>-YYYYMM-", () => {
    const d = new Date(Date.UTC(2026, 5, 17));
    expect(docNumberPrefix("product-returns", d)).toBe("LT-RET-202606-");
    expect(docNumberPrefix("write-offs", d)).toBe("LT-WOF-202606-");
    expect(docNumberPrefix("repackings", d)).toBe("LT-RPK-202606-");
  });
});

describe("getStockDocMeta", () => {
  it("returns meta for each of 8 kinds", () => {
    expect(STOCK_DOCS).toHaveLength(8);
    for (const d of STOCK_DOCS)
      expect(getStockDocMeta(d.kind).label).toBe(d.label);
  });
  it("throws for unknown kind", () => {
    // @ts-expect-error invalid kind
    expect(() => getStockDocMeta("nope")).toThrow();
  });
});

describe("isStockDocKind", () => {
  it("accepts valid slugs", () => {
    expect(isStockDocKind("product-returns")).toBe(true);
    expect(isStockDocKind("stock-transfers")).toBe(true);
  });
  it("rejects invalid", () => {
    expect(isStockDocKind("orders")).toBe(false);
    expect(isStockDocKind("")).toBe(false);
  });
});

describe("normalizeLine", () => {
  it("computes amountEur from weight × priceEur", () => {
    expect(
      normalizeLine({ weight: 20, priceEur: 1.5, quantity: 1 }).amountEur,
    ).toBe(30);
  });
  it("falls back to quantity × priceEur when weight 0", () => {
    expect(
      normalizeLine({ weight: 0, quantity: 4, priceEur: 2 }).amountEur,
    ).toBe(8);
  });
  it("defaults nullable fields", () => {
    const l = normalizeLine({});
    expect(l.productId).toBeNull();
    expect(l.barcode).toBeNull();
    expect(l.quantity).toBe(1);
  });
});

describe("summarizeLines", () => {
  it("sums weight, quantity and amountEur with rounding", () => {
    const lines: NormLine[] = [
      {
        productId: null,
        charHex: null,
        barcode: null,
        weight: 10.1,
        quantity: 2,
        priceEur: 0,
        amountEur: 15.005,
        notes: null,
      },
      {
        productId: null,
        charHex: null,
        barcode: null,
        weight: 5.05,
        quantity: 1,
        priceEur: 0,
        amountEur: 4.5,
        notes: null,
      },
    ];
    const s = summarizeLines(lines);
    expect(s.totalWeight).toBe(15.15);
    expect(s.totalQuantity).toBe(3);
    expect(s.totalEur).toBe(19.51);
  });
  it("returns zeros for empty list", () => {
    expect(summarizeLines([])).toEqual({
      totalWeight: 0,
      totalQuantity: 0,
      totalEur: 0,
    });
  });
});

describe("applyReturnFromCustomerDebt", () => {
  it("writes a negative correction movement for the customer", () => {
    applyReturnFromCustomerDebt({
      returnId: "ret-1",
      customerId: "cust-1",
      totalEur: 42.5,
      occurredAt: new Date("2026-06-17"),
      createdByUserId: "user-1",
    });
    expect(applyDebtMovementSafeMock).toHaveBeenCalledTimes(1);
    const arg = applyDebtMovementSafeMock.mock.calls[0]![0];
    expect(arg.amountEur).toBe(-42.5);
    expect(arg.kind).toBe("correction");
    expect(arg.sourceType).toBe("product_return");
    expect(arg.sourceId).toBe("ret-1");
    expect(arg.customerId).toBe("cust-1");
  });
  it("skips when no customer", () => {
    applyReturnFromCustomerDebt({
      returnId: "ret-2",
      customerId: null,
      totalEur: 10,
      occurredAt: new Date(),
    });
    expect(applyDebtMovementSafeMock).not.toHaveBeenCalled();
  });
  it("skips when total is zero", () => {
    applyReturnFromCustomerDebt({
      returnId: "ret-3",
      customerId: "cust-3",
      totalEur: 0,
      occurredAt: new Date(),
    });
    expect(applyDebtMovementSafeMock).not.toHaveBeenCalled();
  });
});

describe("parseCreateBody — draft-режим (autosave)", () => {
  it("приймає майже порожнє draft-тіло (items за замовч. [])", () => {
    const r = parseCreateBody("write-offs", { draft: true }, "u1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.lines).toHaveLength(0);
  });

  it("ігнорує прапорець draft і парсить рядки", () => {
    const r = parseCreateBody(
      "write-offs",
      { draft: true, items: [{ productId: "p1", weight: 5, priceEur: 2 }] },
      "u1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lines).toHaveLength(1);
      expect(r.data.lines[0]!.amountEur).toBe(10);
    }
  });

  it("product-returns draft приймає порожні items + клієнта-назву", () => {
    const r = parseCreateBody(
      "product-returns",
      { draft: true, customerName: "ТТ Іванов", items: [] },
      "u1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.customerName).toBe("ТТ Іванов");
  });
});
