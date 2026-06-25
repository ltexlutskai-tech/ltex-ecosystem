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
  DIMENSIONS,
  INDICATORS,
  DEFAULT_GROUPS,
  DEFAULT_INDICATORS,
  type FlexCashFlowMovement,
  type CashFlowMaps,
} from "./cashflow-flex";

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyMaps(): CashFlowMaps {
  return {
    articleNameByCode: new Map(),
    accountNameByCode: new Map(),
    clientNameByCode: new Map(),
  };
}

function mv(p: Partial<FlexCashFlowMovement>): FlexCashFlowMovement {
  return {
    occurredAt: new Date("2026-03-15T10:00:00Z"),
    articleCode1C: "art1",
    accountCode1C: "acc1",
    clientCode1C: "cl1",
    direction: 0,
    amountUah: 100,
    amountUpr: 10,
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

const ALL_IND = [
  "inflowUah",
  "outflowUah",
  "netUah",
  "inflowEur",
  "outflowEur",
  "netEur",
];

// ─── normalizeRow: inflow/outflow split by direction ─────────────────────────

describe("normalizeRow", () => {
  it("inflow goes to inflow* and net positive for direction 0 (Прихід)", () => {
    const r = normalizeRow(
      mv({ direction: 0, amountUah: 100, amountUpr: 8 }),
      emptyMaps(),
      ALL_IND,
    );
    expect(r.values.inflowUah).toBe(100);
    expect(r.values.outflowUah).toBe(0);
    expect(r.values.netUah).toBe(100);
    expect(r.values.inflowEur).toBe(8);
    expect(r.values.outflowEur).toBe(0);
    expect(r.values.netEur).toBe(8);
  });

  it("outflow goes to outflow* and net negative for direction 1 (Розхід)", () => {
    const r = normalizeRow(
      mv({ direction: 1, amountUah: 70, amountUpr: 5 }),
      emptyMaps(),
      ALL_IND,
    );
    expect(r.values.inflowUah).toBe(0);
    expect(r.values.outflowUah).toBe(70);
    expect(r.values.netUah).toBe(-70);
    expect(r.values.inflowEur).toBe(0);
    expect(r.values.outflowEur).toBe(5);
    expect(r.values.netEur).toBe(-5);
  });

  it("EUR uses amountUpr; null → 0", () => {
    const inflow = normalizeRow(
      mv({ direction: 0, amountUpr: null }),
      emptyMaps(),
      ["inflowEur", "netEur"],
    );
    expect(inflow.values.inflowEur).toBe(0);
    expect(inflow.values.netEur).toBe(0);

    const outflow = normalizeRow(
      mv({ direction: 1, amountUpr: null }),
      emptyMaps(),
      ["outflowEur", "netEur"],
    );
    expect(outflow.values.outflowEur).toBe(0);
    expect(outflow.values.netEur).toBe(0);
  });

  it("resolves article / account / client labels, fallbacks otherwise", () => {
    const maps = emptyMaps();
    maps.articleNameByCode.set("art1", "Оплата постачальнику");
    maps.accountNameByCode.set("acc1", "Каса основна");
    maps.clientNameByCode.set("cl1", "ТОВ Клієнт");
    const r = normalizeRow(mv({}), maps, ["netUah"]);
    expect(r.dims.article!.label).toBe("Оплата постачальнику");
    expect(r.dims.account!.label).toBe("Каса основна");
    expect(r.dims.client!.label).toBe("ТОВ Клієнт");

    const empty = normalizeRow(
      mv({ articleCode1C: null, accountCode1C: null, clientCode1C: null }),
      emptyMaps(),
      ["netUah"],
    );
    expect(empty.dims.article!.label).toBe("Без статті");
    expect(empty.dims.account!.label).toBe("—");
    expect(empty.dims.client!.label).toBe("—");
  });

  it("resolves direction / year / month dimensions", () => {
    const inflow = normalizeRow(
      mv({ direction: 0, occurredAt: new Date("2026-03-15T10:00:00Z") }),
      emptyMaps(),
      ["netUah"],
    );
    expect(inflow.dims.direction!.id).toBe("0");
    expect(inflow.dims.direction!.label).toBe("Прихід");
    expect(inflow.dims.year!.label).toBe("2026");
    expect(inflow.dims.month!.id).toBe("2026-03");

    const outflow = normalizeRow(mv({ direction: 1 }), emptyMaps(), ["netUah"]);
    expect(outflow.dims.direction!.label).toBe("Розхід");
  });
});

// ─── tree: grouping + net = inflow − outflow, sums up the tree ───────────────

describe("cashflow tree aggregation", () => {
  it("groups by article and splits inflow/outflow by direction", () => {
    const maps = emptyMaps();
    maps.articleNameByCode.set("art1", "Стаття A");
    maps.articleNameByCode.set("art2", "Стаття B");
    const rows: NormalizedRow[] = [
      normalizeRow(
        mv({ articleCode1C: "art1", direction: 0, amountUah: 100 }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ articleCode1C: "art1", direction: 1, amountUah: 40 }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ articleCode1C: "art2", direction: 0, amountUah: 30 }),
        maps,
        ALL_IND,
      ),
    ];
    const tree = buildSalesTree(rows, ["article"], ALL_IND);
    const a = findNode(tree, "Стаття A")!;
    expect(a.values.inflowUah).toBe(100);
    expect(a.values.outflowUah).toBe(40);
    // net = inflow − outflow, summed correctly up the tree.
    expect(a.values.netUah).toBe(60);
    const b = findNode(tree, "Стаття B")!;
    expect(b.values.inflowUah).toBe(30);
    expect(b.values.netUah).toBe(30);

    const g = grandTotal(rows, ALL_IND);
    expect(g.inflowUah).toBe(130);
    expect(g.outflowUah).toBe(40);
    expect(g.netUah).toBe(90);
  });

  it("groups by direction: Прихід / Розхід as separate top nodes", () => {
    const rows: NormalizedRow[] = [
      normalizeRow(mv({ direction: 0, amountUah: 100 }), emptyMaps(), ALL_IND),
      normalizeRow(mv({ direction: 0, amountUah: 50 }), emptyMaps(), ALL_IND),
      normalizeRow(mv({ direction: 1, amountUah: 70 }), emptyMaps(), ALL_IND),
    ];
    const tree = buildSalesTree(rows, ["direction"], ALL_IND);
    const inflow = findNode(tree, "Прихід")!;
    expect(inflow.values.inflowUah).toBe(150);
    expect(inflow.values.outflowUah).toBe(0);
    expect(inflow.values.netUah).toBe(150);
    const outflow = findNode(tree, "Розхід")!;
    expect(outflow.values.outflowUah).toBe(70);
    expect(outflow.values.netUah).toBe(-70);
  });

  it("net subtotal = Σ children and = Σ(inflow − outflow) multi-level", () => {
    const maps = emptyMaps();
    maps.clientNameByCode.set("cl1", "Клієнт 1");
    const rows: NormalizedRow[] = [
      normalizeRow(
        mv({
          clientCode1C: "cl1",
          direction: 0,
          amountUah: 200,
          amountUpr: 20,
        }),
        maps,
        ALL_IND,
      ),
      normalizeRow(
        mv({ clientCode1C: "cl1", direction: 1, amountUah: 80, amountUpr: 7 }),
        maps,
        ALL_IND,
      ),
    ];
    const tree = buildSalesTree(rows, ["client", "direction"], ALL_IND);
    const client = findNode(tree, "Клієнт 1")!;
    expect(client.level).toBe(0);
    expect(client.children).toHaveLength(2);
    const childNetSum = client.children.reduce(
      (s, c) => s + (c.values.netUah ?? 0),
      0,
    );
    expect(client.values.netUah).toBe(childNetSum);
    expect(client.values.netUah).toBe(120);
    expect(client.values.netEur).toBe(13);
  });

  it("EUR null contributes 0 across the tree", () => {
    const rows: NormalizedRow[] = [
      normalizeRow(
        mv({ direction: 0, amountUah: 100, amountUpr: null }),
        emptyMaps(),
        ALL_IND,
      ),
      normalizeRow(
        mv({ direction: 0, amountUah: 50, amountUpr: 4 }),
        emptyMaps(),
        ALL_IND,
      ),
    ];
    const g = grandTotal(rows, ALL_IND);
    expect(g.inflowUah).toBe(150);
    expect(g.inflowEur).toBe(4);
    expect(g.netEur).toBe(4);
  });
});

// ─── registry sanity ──────────────────────────────────────────────────────────

describe("registries", () => {
  it("exposes expected dimension keys", () => {
    expect(DIMENSIONS.map((d) => d.key)).toEqual([
      "article",
      "account",
      "client",
      "direction",
      "year",
      "month",
    ]);
  });

  it("exposes expected money indicator keys (all summable)", () => {
    expect(INDICATORS.map((i) => i.key)).toEqual([
      "inflowUah",
      "outflowUah",
      "netUah",
      "inflowEur",
      "outflowEur",
      "netEur",
    ]);
    expect(INDICATORS.every((i) => i.kind === "money")).toBe(true);
  });

  it("default config: group by article, inflow/outflow/net ₴", () => {
    expect(DEFAULT_GROUPS).toEqual(["article"]);
    expect(DEFAULT_INDICATORS).toEqual(["inflowUah", "outflowUah", "netUah"]);
  });

  it("roundIndicator rounds money to 2dp", () => {
    expect(roundIndicator("netUah", 0.1 + 0.2)).toBe(0.3);
    expect(roundIndicator("inflowEur", 1.005)).toBe(1.01);
  });
});
