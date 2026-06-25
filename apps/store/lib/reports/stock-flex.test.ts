import { describe, it, expect } from "vitest";
import {
  buildSalesTree,
  grandTotal,
  type NormalizedRow,
  type TreeNode,
} from "./sales-flex";
import {
  normalizeRow,
  roundIndicator,
  DEFAULT_GROUPS,
  DEFAULT_INDICATORS,
  type FlexStockMovement,
  type StockMaps,
} from "./stock-flex";

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyMaps(): StockMaps {
  return {
    productNameById: new Map(),
    productNameByCode: new Map(),
    categoryByProductId: new Map(),
    categoryByProductCode: new Map(),
    warehouseNameByCode: new Map(),
    qualityNameByCode: new Map(),
  };
}

function mv(p: Partial<FlexStockMovement>): FlexStockMovement {
  return {
    productCode1C: "prod1",
    productId: null,
    warehouseCode1C: "wh1",
    quality: "q1",
    qty: 10,
    weightKg: 100,
    recordKind: 0,
    ...p,
  };
}

function findNode(nodes: TreeNode[], label: string): TreeNode | undefined {
  for (const n of nodes) {
    if (n.label === label) return n;
    const found = findNode(n.children, label);
    if (found) return found;
  }
  return undefined;
}

const ALL_IND = ["qtyBalance", "weightBalanceKg"];

// ─── defaults ────────────────────────────────────────────────────────────────

describe("stock-flex defaults", () => {
  it("default groups = category, indicators = qty + weight", () => {
    expect(DEFAULT_GROUPS).toEqual(["category"]);
    expect(DEFAULT_INDICATORS).toEqual(["qtyBalance", "weightBalanceKg"]);
  });
});

// ─── normalizeRow: signed balance by recordKind ──────────────────────────────

describe("normalizeRow (signed balance)", () => {
  it("прихід (recordKind 0) → +qty / +weight", () => {
    const r = normalizeRow(
      mv({ recordKind: 0, qty: 10, weightKg: 100 }),
      emptyMaps(),
      ALL_IND,
    );
    expect(r.values.qtyBalance).toBe(10);
    expect(r.values.weightBalanceKg).toBe(100);
  });

  it("розхід (recordKind 1) → −qty / −weight", () => {
    const r = normalizeRow(
      mv({ recordKind: 1, qty: 4, weightKg: 40 }),
      emptyMaps(),
      ALL_IND,
    );
    expect(r.values.qtyBalance).toBe(-4);
    expect(r.values.weightBalanceKg).toBe(-40);
  });

  it("weight null → 0", () => {
    const inbound = normalizeRow(
      mv({ recordKind: 0, weightKg: null }),
      emptyMaps(),
      ALL_IND,
    );
    expect(inbound.values.weightBalanceKg).toBe(0);

    const outbound = normalizeRow(
      mv({ recordKind: 1, weightKg: null }),
      emptyMaps(),
      ALL_IND,
    );
    expect(outbound.values.weightBalanceKg).toBe(0);
  });

  it("резолвить товар / склад / якість, fallback інакше", () => {
    const maps = emptyMaps();
    maps.productNameByCode.set("prod1", "Куртки зимові");
    maps.warehouseNameByCode.set("wh1", "Основний склад");
    maps.qualityNameByCode.set("q1", "Екстра");
    const r = normalizeRow(mv({}), maps, ALL_IND);
    expect(r.dims.product!.label).toBe("Куртки зимові");
    expect(r.dims.warehouse!.label).toBe("Основний склад");
    expect(r.dims.quality!.label).toBe("Екстра");

    const empty = normalizeRow(
      mv({
        productCode1C: null,
        productId: null,
        warehouseCode1C: null,
        quality: null,
      }),
      emptyMaps(),
      ALL_IND,
    );
    expect(empty.dims.warehouse!.label).toBe("Без складу");
    expect(empty.dims.quality!.label).toBe("—");
  });

  it("категорія резолвиться з мапи, інакше «Без категорії»", () => {
    const maps = emptyMaps();
    maps.categoryByProductCode.set("prod1", "Верхній одяг");
    const r = normalizeRow(mv({}), maps, ALL_IND);
    expect(r.dims.category!.label).toBe("Верхній одяг");

    const noCat = normalizeRow(mv({}), emptyMaps(), ALL_IND);
    expect(noCat.dims.category!.label).toBe("Без категорії");
  });

  it("якість як вільний текст показується як є", () => {
    const r = normalizeRow(mv({ quality: "Сток" }), emptyMaps(), ALL_IND);
    expect(r.dims.quality!.label).toBe("Сток");
  });
});

// ─── tree: balance = Σ signed (прихід − розхід), sums up the tree ────────────

describe("stock balance tree aggregation", () => {
  it("групує по товару, баланс = прихід − розхід", () => {
    const maps = emptyMaps();
    maps.productNameByCode.set("prod1", "Товар A");
    maps.productNameByCode.set("prod2", "Товар B");
    const rows: NormalizedRow[] = [
      normalizeRow(
        mv({ productCode1C: "prod1", recordKind: 0, qty: 10, weightKg: 100 }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ productCode1C: "prod1", recordKind: 1, qty: 4, weightKg: 40 }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ productCode1C: "prod2", recordKind: 0, qty: 5, weightKg: 50 }),
        maps,
        ALL_IND,
      ),
    ];
    const tree = buildSalesTree(rows, ["product"], ALL_IND);
    const a = findNode(tree, "Товар A")!;
    expect(a.values.qtyBalance).toBe(6); // 10 − 4
    expect(a.values.weightBalanceKg).toBe(60); // 100 − 40
    const b = findNode(tree, "Товар B")!;
    expect(b.values.qtyBalance).toBe(5);
    expect(b.values.weightBalanceKg).toBe(50);

    const g = grandTotal(rows, ALL_IND);
    expect(g.qtyBalance).toBe(11);
    expect(g.weightBalanceKg).toBe(110);
  });

  it("групує по категорії з підсумками-нащадками", () => {
    const maps = emptyMaps();
    maps.categoryByProductCode.set("prod1", "Одяг");
    maps.categoryByProductCode.set("prod2", "Одяг");
    maps.categoryByProductCode.set("prod3", "Взуття");
    const rows: NormalizedRow[] = [
      normalizeRow(
        mv({ productCode1C: "prod1", recordKind: 0, qty: 10, weightKg: 100 }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ productCode1C: "prod2", recordKind: 0, qty: 20, weightKg: 200 }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ productCode1C: "prod3", recordKind: 1, qty: 5, weightKg: 50 }),
        maps,
        ALL_IND,
      ),
    ];
    const tree = buildSalesTree(rows, ["category"], ALL_IND);
    const odyah = findNode(tree, "Одяг")!;
    expect(odyah.values.qtyBalance).toBe(30);
    expect(odyah.values.weightBalanceKg).toBe(300);
    const vzuttya = findNode(tree, "Взуття")!;
    expect(vzuttya.values.qtyBalance).toBe(-5);
  });

  it("повне списання → нульовий залишок", () => {
    const rows: NormalizedRow[] = [
      normalizeRow(
        mv({ recordKind: 0, qty: 7, weightKg: 70 }),
        emptyMaps(),
        ALL_IND,
      ),
      normalizeRow(
        mv({ recordKind: 1, qty: 7, weightKg: 70 }),
        emptyMaps(),
        ALL_IND,
      ),
    ];
    const g = grandTotal(rows, ALL_IND);
    expect(g.qtyBalance).toBe(0);
    expect(g.weightBalanceKg).toBe(0);
  });
});

// ─── rounding ────────────────────────────────────────────────────────────────

describe("roundIndicator", () => {
  it("округлює до 3 знаків", () => {
    expect(roundIndicator("qtyBalance", 1.23456)).toBe(1.235);
    expect(roundIndicator("weightBalanceKg", 100.0001)).toBe(100);
  });
});
