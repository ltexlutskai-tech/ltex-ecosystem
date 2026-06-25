import { describe, it, expect } from "vitest";
import {
  parseFilters,
  applyRowFilters,
  collectFilterOptions,
  FILTER_OPS,
  FILTER_OPTIONS_CAP,
  type FilterOp,
} from "./flex-filters";
import type { NormalizedRow } from "./sales-flex";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a normalized row from dim → label map. */
function row(dims: Record<string, string>): NormalizedRow {
  const d: NormalizedRow["dims"] = {};
  for (const [k, label] of Object.entries(dims)) d[k] = { id: label, label };
  return { dims: d, values: {} };
}

const getLabel = (r: NormalizedRow, dim: string) => r.dims[dim]?.label ?? "";

function sp(obj: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.set(k, v);
  return p;
}

// ─── parseFilters ─────────────────────────────────────────────────────────────

describe("parseFilters", () => {
  it("defaults op to contains when fop_ absent (back-compat)", () => {
    const f = parseFilters(sp({ f_client: "Луцьк" }), ["client"]);
    expect(f).toEqual([{ dim: "client", op: "contains", value: "Луцьк" }]);
  });

  it("reads explicit op from fop_<dim>", () => {
    const f = parseFilters(sp({ f_region: "Волинська", fop_region: "eq" }), [
      "region",
    ]);
    expect(f).toEqual([{ dim: "region", op: "eq", value: "Волинська" }]);
  });

  it("skips filters with empty value unless op is filled/empty", () => {
    const f = parseFilters(
      sp({ f_a: "", f_b: "  ", f_c: "x", fop_d: "filled", fop_e: "empty" }),
      ["a", "b", "c", "d", "e"],
    );
    expect(f.map((x) => x.dim).sort()).toEqual(["c", "d", "e"]);
  });

  it("filled/empty keep no value requirement", () => {
    const f = parseFilters(sp({ fop_agent: "empty" }), ["agent"]);
    expect(f).toEqual([{ dim: "agent", op: "empty", value: "" }]);
  });

  it("falls back to contains for unknown op string", () => {
    const f = parseFilters(sp({ f_x: "v", fop_x: "bogus" }), ["x"]);
    expect(f[0]!.op).toBe("contains");
  });

  it("trims value", () => {
    const f = parseFilters(sp({ f_x: "  hi  " }), ["x"]);
    expect(f[0]!.value).toBe("hi");
  });
});

// ─── applyRowFilters: per-operator ────────────────────────────────────────────

describe("applyRowFilters operators", () => {
  const rows = [
    row({ region: "Волинська", agent: "Бойко" }),
    row({ region: "Львівська", agent: "" }),
    row({ region: "Рівненська", agent: "Без агента" }),
  ];

  function apply(filters: { dim: string; op: FilterOp; value: string }[]) {
    return applyRowFilters(rows, filters, getLabel).map(
      (r) => r.dims.region!.label,
    );
  }

  it("contains (case-insensitive substring)", () => {
    expect(apply([{ dim: "region", op: "contains", value: "лин" }])).toEqual([
      "Волинська",
    ]);
  });

  it("eq exact (trim + ci)", () => {
    expect(apply([{ dim: "region", op: "eq", value: "львівська" }])).toEqual([
      "Львівська",
    ]);
  });

  it("ne excludes exact", () => {
    expect(apply([{ dim: "region", op: "ne", value: "Волинська" }])).toEqual([
      "Львівська",
      "Рівненська",
    ]);
  });

  it("in: label ∈ comma list", () => {
    expect(
      apply([{ dim: "region", op: "in", value: "Волинська, Рівненська" }]),
    ).toEqual(["Волинська", "Рівненська"]);
  });

  it("nin: label ∉ comma list", () => {
    expect(
      apply([{ dim: "region", op: "nin", value: "Волинська, Рівненська" }]),
    ).toEqual(["Львівська"]);
  });

  it("filled: agent not empty and not 'Без …'", () => {
    expect(apply([{ dim: "agent", op: "filled", value: "" }])).toEqual([
      "Волинська",
    ]);
  });

  it("empty: agent blank or 'Без …' or '—'", () => {
    expect(apply([{ dim: "agent", op: "empty", value: "" }])).toEqual([
      "Львівська",
      "Рівненська",
    ]);
  });

  it("combines multiple filters with AND", () => {
    const res = applyRowFilters(
      rows,
      [
        { dim: "region", op: "ne", value: "Львівська" },
        { dim: "agent", op: "empty", value: "" },
      ],
      getLabel,
    );
    expect(res.map((r) => r.dims.region!.label)).toEqual(["Рівненська"]);
  });

  it("empty filter set returns all rows", () => {
    expect(applyRowFilters(rows, [], getLabel)).toHaveLength(3);
  });
});

// ─── collectFilterOptions ─────────────────────────────────────────────────────

describe("collectFilterOptions", () => {
  it("returns sorted distinct labels, skipping blank and '—'", () => {
    const rows = [
      row({ region: "Львівська" }),
      row({ region: "Волинська" }),
      row({ region: "Волинська" }),
      row({ region: "—" }),
      row({ region: "" }),
    ];
    const opts = collectFilterOptions(rows, ["region"], getLabel);
    expect(opts.region).toEqual(["Волинська", "Львівська"]);
  });

  it("returns [] when distinct count exceeds cap (high cardinality)", () => {
    const rows: NormalizedRow[] = [];
    for (let i = 0; i <= FILTER_OPTIONS_CAP + 5; i++) {
      rows.push(row({ client: `Клієнт ${i}` }));
    }
    const opts = collectFilterOptions(rows, ["client"], getLabel);
    expect(opts.client).toEqual([]);
  });

  it("handles multiple dims independently", () => {
    const rows = [row({ a: "X", b: "1" }), row({ a: "Y", b: "1" })];
    const opts = collectFilterOptions(rows, ["a", "b"], getLabel);
    expect(opts.a).toEqual(["X", "Y"]);
    expect(opts.b).toEqual(["1"]);
  });
});

// ─── registry sanity ──────────────────────────────────────────────────────────

describe("FILTER_OPS", () => {
  it("exposes all 7 operators with labels", () => {
    expect(FILTER_OPS.map((o) => o.value)).toEqual([
      "contains",
      "eq",
      "ne",
      "in",
      "nin",
      "filled",
      "empty",
    ]);
  });
});
