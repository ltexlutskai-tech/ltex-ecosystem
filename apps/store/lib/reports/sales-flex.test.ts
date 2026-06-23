import { describe, it, expect } from "vitest";
import {
  buildSalesTree,
  grandTotal,
  normalizeRow,
  roundIndicator,
  DIMENSIONS,
  INDICATORS,
  type FlexSalesMovement,
  type FlexMaps,
  type NormalizedRow,
  type TreeNode,
} from "./sales-flex";

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyMaps(): FlexMaps {
  return {
    clientById: new Map(),
    productNameById: new Map(),
    productNameByCode: new Map(),
    orderNoByCode: new Map(),
    saleNoByCode: new Map(),
  };
}

function mv(p: Partial<FlexSalesMovement>): FlexSalesMovement {
  return {
    occurredAt: new Date("2026-03-15T10:00:00Z"),
    productCode1C: "pc1",
    productId: "pid1",
    clientCode1C: "cc1",
    clientId: "cid1",
    orderCode1C: "oc1",
    saleCode1C: "sc1",
    recorderCode1C: "rc1",
    qty: 1,
    weightKg: 10,
    revenueEur: 100,
    revenueNoDiscountEur: 120,
    recordKind: 0,
    ...p,
  };
}

/** Build a normalized row directly (avoids dim resolution noise in tree tests). */
function row(
  dims: Record<string, string>,
  values: Record<string, number>,
): NormalizedRow {
  const d: NormalizedRow["dims"] = {};
  for (const [k, label] of Object.entries(dims)) d[k] = { id: label, label };
  return { dims: d, values };
}

function findNode(nodes: TreeNode[], label: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.label === label) return n;
    const found = findNode(n.children, label);
    if (found) return found;
  }
  return undefined;
}

// ─── buildSalesTree ──────────────────────────────────────────────────────────

describe("buildSalesTree", () => {
  it("groups single-level and sums indicators", () => {
    const rows = [
      row({ client: "A" }, { revenueEur: 100, qty: 1 }),
      row({ client: "A" }, { revenueEur: 50, qty: 2 }),
      row({ client: "B" }, { revenueEur: 30, qty: 1 }),
    ];
    const tree = buildSalesTree(rows, ["client"], ["revenueEur", "qty"]);
    expect(tree).toHaveLength(2);
    const a = findNode(tree, "A")!;
    expect(a.values.revenueEur).toBe(150);
    expect(a.values.qty).toBe(3);
    const b = findNode(tree, "B")!;
    expect(b.values.revenueEur).toBe(30);
  });

  it("sorts by first money indicator descending", () => {
    const rows = [
      row({ client: "Small" }, { revenueEur: 10 }),
      row({ client: "Big" }, { revenueEur: 999 }),
    ];
    const tree = buildSalesTree(rows, ["client"], ["revenueEur"]);
    expect(tree[0]!.label).toBe("Big");
    expect(tree[1]!.label).toBe("Small");
  });

  it("nests multi-level and parent values = Σ children", () => {
    const rows = [
      row({ region: "R1", client: "A" }, { revenueEur: 100 }),
      row({ region: "R1", client: "B" }, { revenueEur: 200 }),
      row({ region: "R2", client: "C" }, { revenueEur: 50 }),
    ];
    const tree = buildSalesTree(rows, ["region", "client"], ["revenueEur"]);
    const r1 = findNode(tree, "R1")!;
    expect(r1.level).toBe(0);
    expect(r1.children).toHaveLength(2);
    // Subtotal = Σ of children
    const childSum = r1.children.reduce((s, c) => s + c.values.revenueEur!, 0);
    expect(r1.values.revenueEur).toBe(childSum);
    expect(r1.values.revenueEur).toBe(300);
    const child = findNode(r1.children, "A")!;
    expect(child.level).toBe(1);
    expect(child.children).toHaveLength(0);
  });

  it("handles sign: returns subtract from sales", () => {
    const rows = [
      row({ client: "A" }, { revenueEur: 100 }), // sale
      row({ client: "A" }, { revenueEur: -30 }), // return (already signed)
    ];
    const tree = buildSalesTree(rows, ["client"], ["revenueEur"]);
    expect(findNode(tree, "A")!.values.revenueEur).toBe(70);
  });

  it("returns [] for empty groups (grand total computed separately)", () => {
    const rows = [row({ client: "A" }, { revenueEur: 100 })];
    expect(buildSalesTree(rows, [], ["revenueEur"])).toEqual([]);
  });

  it("rounds money to 2dp, weight to 3dp", () => {
    const rows = [
      row({ client: "A" }, { revenueEur: 0.1 + 0.2, weightKg: 1.0001 }),
    ];
    const tree = buildSalesTree(rows, ["client"], ["revenueEur", "weightKg"]);
    const a = findNode(tree, "A")!;
    expect(a.values.revenueEur).toBe(0.3);
    expect(a.values.weightKg).toBe(1);
  });
});

// ─── grandTotal ──────────────────────────────────────────────────────────────

describe("grandTotal", () => {
  it("sums all rows regardless of grouping", () => {
    const rows = [
      row({ client: "A" }, { revenueEur: 100, qty: 1 }),
      row({ client: "B" }, { revenueEur: 200, qty: 3 }),
    ];
    const g = grandTotal(rows, ["revenueEur", "qty"]);
    expect(g.revenueEur).toBe(300);
    expect(g.qty).toBe(4);
  });

  it("grand total = Σ of top-level node subtotals", () => {
    const rows = [
      row({ region: "R1", client: "A" }, { revenueEur: 100 }),
      row({ region: "R2", client: "B" }, { revenueEur: 250 }),
    ];
    const tree = buildSalesTree(rows, ["region", "client"], ["revenueEur"]);
    const g = grandTotal(rows, ["revenueEur"]);
    const topSum = tree.reduce((s, n) => s + n.values.revenueEur!, 0);
    expect(g.revenueEur).toBe(topSum);
    expect(g.revenueEur).toBe(350);
  });
});

// ─── normalizeRow ────────────────────────────────────────────────────────────

describe("normalizeRow", () => {
  it("applies +1 sign for sale (recordKind 0)", () => {
    const r = normalizeRow(mv({ recordKind: 0 }), emptyMaps(), [
      "revenueEur",
      "qty",
    ]);
    expect(r.values.revenueEur).toBe(100);
    expect(r.values.qty).toBe(1);
  });

  it("applies -1 sign for return (recordKind 1)", () => {
    const r = normalizeRow(mv({ recordKind: 1 }), emptyMaps(), ["revenueEur"]);
    expect(r.values.revenueEur).toBe(-100);
  });

  it("computes discount = revenueNoDiscount − revenue (signed)", () => {
    const r = normalizeRow(
      mv({ revenueEur: 100, revenueNoDiscountEur: 120 }),
      emptyMaps(),
      ["discountEur"],
    );
    expect(r.values.discountEur).toBe(20);
  });

  it("discount falls back to 0 when no-discount value missing", () => {
    const r = normalizeRow(
      mv({ revenueEur: 100, revenueNoDiscountEur: null }),
      emptyMaps(),
      ["discountEur", "revenueNoDiscountEur"],
    );
    expect(r.values.discountEur).toBe(0);
    expect(r.values.revenueNoDiscountEur).toBe(100);
  });

  it("resolves product by id first, then code, then short hex", () => {
    const maps = emptyMaps();
    maps.productNameById.set("pid1", "Куртки зимові");
    const r = normalizeRow(mv({}), maps, ["qty"]);
    expect(r.dims.product!.label).toBe("Куртки зимові");

    const maps2 = emptyMaps();
    maps2.productNameByCode.set("pc1", "По коду");
    const r2 = normalizeRow(mv({ productId: null }), maps2, ["qty"]);
    expect(r2.dims.product!.label).toBe("По коду");

    const r3 = normalizeRow(
      mv({ productId: null, productCode1C: "abcdef123456789" }),
      emptyMaps(),
      ["qty"],
    );
    expect(r3.dims.product!.label).toBe("…456789");
  });

  it("resolves agent via client's agentName, not movement", () => {
    const maps = emptyMaps();
    maps.clientById.set("cid1", {
      name: "Клієнт",
      region: "Волинська",
      city: "Луцьк",
      agentName: "Бойко І.",
      categoryLabel: "Магазин",
      priceTypeLabel: "Опт",
    });
    const r = normalizeRow(mv({}), maps, ["qty"]);
    expect(r.dims.agent!.label).toBe("Бойко І.");
    expect(r.dims.region!.label).toBe("Волинська");
    expect(r.dims.city!.label).toBe("Луцьк");
    expect(r.dims.categoryTT!.label).toBe("Магазин");
    expect(r.dims.priceType!.label).toBe("Опт");
    expect(r.dims.client!.label).toBe("Клієнт");
  });

  it("falls back to 'Без агента' / 'Без області' when unresolved", () => {
    const r = normalizeRow(mv({ clientId: null }), emptyMaps(), ["qty"]);
    expect(r.dims.agent!.label).toBe("Без агента");
    expect(r.dims.region!.label).toBe("Без області");
  });

  it("resolves year and month dimensions", () => {
    const r = normalizeRow(
      mv({ occurredAt: new Date("2026-03-15T10:00:00Z") }),
      emptyMaps(),
      ["qty"],
    );
    expect(r.dims.year!.label).toBe("2026");
    expect(r.dims.month!.id).toBe("2026-03");
  });
});

// ─── integration: normalize → tree → grand ───────────────────────────────────

describe("normalize + tree integration with filters semantics", () => {
  it("net turnover with mixed sales and returns", () => {
    const maps = emptyMaps();
    maps.clientById.set("cid1", {
      name: "A",
      region: null,
      city: null,
      agentName: null,
      categoryLabel: null,
      priceTypeLabel: null,
    });
    const rows = [
      normalizeRow(mv({ recordKind: 0, revenueEur: 100 }), maps, [
        "revenueEur",
      ]),
      normalizeRow(mv({ recordKind: 1, revenueEur: 40 }), maps, ["revenueEur"]),
    ];
    const tree = buildSalesTree(rows, ["client"], ["revenueEur"]);
    expect(findNode(tree, "A")!.values.revenueEur).toBe(60);
    expect(grandTotal(rows, ["revenueEur"]).revenueEur).toBe(60);
  });
});

// ─── registry sanity ──────────────────────────────────────────────────────────

describe("registries", () => {
  it("exposes expected dimension keys", () => {
    const keys = DIMENSIONS.map((d) => d.key);
    expect(keys).toEqual([
      "product",
      "client",
      "region",
      "city",
      "agent",
      "categoryTT",
      "priceType",
      "order",
      "saleDoc",
      "year",
      "month",
    ]);
  });

  it("exposes expected indicator keys", () => {
    const keys = INDICATORS.map((i) => i.key);
    expect(keys).toEqual([
      "qty",
      "weightKg",
      "revenueEur",
      "revenueNoDiscountEur",
      "discountEur",
    ]);
  });

  it("roundIndicator uses 2dp for money, 3dp for qty/weight", () => {
    expect(roundIndicator("revenueEur", 1.005)).toBe(1.01);
    expect(roundIndicator("weightKg", 1.00049)).toBe(1.0);
    expect(roundIndicator("qty", 1.23456)).toBe(1.235);
  });
});
