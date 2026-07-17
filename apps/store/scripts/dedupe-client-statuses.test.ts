import { describe, expect, it } from "vitest";
import {
  isCanonicalCode,
  planStatusDedup,
  type StatusRow,
} from "./dedupe-client-statuses";

describe("isCanonicalCode", () => {
  it("9-значний числовий = канонічний", () => {
    expect(isCanonicalCode("000000001")).toBe(true);
    expect(isCanonicalCode("active")).toBe(false);
    expect(isCanonicalCode("12345")).toBe(false);
    expect(isCanonicalCode("0000000012")).toBe(false);
  });
});

describe("planStatusDedup", () => {
  const rows: StatusRow[] = [
    { id: "a1", code: "000000001", label: "Активний" },
    { id: "a2", code: "active", label: "Активний" },
    { id: "n1", code: "new", label: "Новий" },
    { id: "n2", code: "000000003", label: "Новий" },
    { id: "z", code: "000000005", label: "Закрився" },
  ];

  it("групує за назвою й обирає канонічний 9-значний код", () => {
    const plans = planStatusDedup(rows);
    // 2 групи з дублями: Активний, Новий. «Закрився» — унікальний, пропущено.
    expect(plans).toHaveLength(2);

    const active = plans.find((p) => p.label === "Активний")!;
    expect(active.canonical.id).toBe("a1");
    expect(active.duplicates.map((d) => d.id)).toEqual(["a2"]);

    const nov = plans.find((p) => p.label === "Новий")!;
    expect(nov.canonical.id).toBe("n2"); // 9-значний, попри те що n1 перший
    expect(nov.duplicates.map((d) => d.id)).toEqual(["n1"]);
  });

  it("без дублів → порожній план", () => {
    expect(
      planStatusDedup([{ id: "x", code: "000000001", label: "Активний" }]),
    ).toEqual([]);
  });

  it("група без 9-значного коду → канонічний = перший", () => {
    const plans = planStatusDedup([
      { id: "p1", code: "foo", label: "Тест" },
      { id: "p2", code: "bar", label: "Тест" },
    ]);
    expect(plans[0]?.canonical.id).toBe("p1");
    expect(plans[0]?.duplicates.map((d) => d.id)).toEqual(["p2"]);
  });
});
