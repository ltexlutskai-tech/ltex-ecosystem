import { describe, it, expect } from "vitest";

import {
  pickSurvivor,
  splitByCustomer,
  splitPricesByKey,
  type MergeCandidate,
} from "./merge-duplicate-products";

function cand(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  return {
    id: "p1",
    code1C: "aa",
    name: "Товар",
    categoryName: "Футболки",
    freeLots: 0,
    totalLots: 0,
    inStock: false,
    createdAt: new Date("2020-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("pickSurvivor — вибір цільового товару у групі дублікатів", () => {
  it("кидає на порожній групі", () => {
    expect(() => pickSurvivor([])).toThrow();
  });

  it("1) найбільше вільних лотів виграє (навіть якщо новіший конкурент)", () => {
    const a = cand({ id: "a", freeLots: 2, totalLots: 5 });
    const b = cand({
      id: "b",
      freeLots: 10,
      totalLots: 10,
      createdAt: new Date("2019-01-01T00:00:00Z"),
    });
    expect(pickSurvivor([a, b]).id).toBe("b");
  });

  it("2) при рівних вільних лотах виграє inStock=true", () => {
    const a = cand({ id: "a", freeLots: 0, inStock: false });
    const b = cand({ id: "b", freeLots: 0, inStock: true });
    expect(pickSurvivor([a, b]).id).toBe("b");
  });

  it("3) при рівних лотах+inStock виграє новіший createdAt", () => {
    const a = cand({
      id: "a",
      freeLots: 1,
      inStock: true,
      createdAt: new Date("2021-05-01T00:00:00Z"),
    });
    const b = cand({
      id: "b",
      freeLots: 1,
      inStock: true,
      createdAt: new Date("2023-05-01T00:00:00Z"),
    });
    expect(pickSurvivor([a, b]).id).toBe("b");
  });

  it("3b) при рівних лотах+inStock короткий code1C бʼє падений (00000001358), навіть старіший", () => {
    // Кейс L.MIX Sleepwear M / Livarno 50*36 з dry-run 2026-07-03: обидва
    // «мертві» (0 вільних, inStock=false), падений запис новіший — але
    // канонічним має лишатись короткий (живий каталог).
    const shortCode = cand({
      id: "short",
      code1C: "1447",
      createdAt: new Date("2021-01-01T00:00:00Z"),
    });
    const padded = cand({
      id: "padded",
      code1C: "00000001447",
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    expect(pickSurvivor([shortCode, padded]).id).toBe("short");
    expect(pickSurvivor([padded, shortCode]).id).toBe("short");
  });

  it("3c) вільні лоти важливіші за короткий код (падений з лотами виграє)", () => {
    const shortCode = cand({ id: "short", code1C: "1447", freeLots: 0 });
    const padded = cand({ id: "padded", code1C: "00000001447", freeLots: 2 });
    expect(pickSurvivor([shortCode, padded]).id).toBe("padded");
  });

  it("4) повний тай — детермінований тай-брейкер за id", () => {
    const a = cand({ id: "zzz" });
    const b = cand({ id: "aaa" });
    expect(pickSurvivor([a, b]).id).toBe("aaa");
    expect(pickSurvivor([b, a]).id).toBe("aaa");
  });

  it("група 3+: survivor = найбільше вільних лотів", () => {
    const a = cand({ id: "a", freeLots: 0 });
    const b = cand({ id: "b", freeLots: 3 });
    const c = cand({ id: "c", freeLots: 1 });
    expect(pickSurvivor([a, b, c]).id).toBe("b");
  });
});

describe("splitByCustomer — дедуп unique(customerId, productId)", () => {
  it("рядок конфліктний з survivor → drop; новий → move + додається у taken", () => {
    const taken = new Set<string>(["c1"]);
    const rows = [
      { id: "f1", customerId: "c1" }, // конфлікт із survivor
      { id: "f2", customerId: "c2" }, // новий
    ];
    const { moveIds, dropIds } = splitByCustomer(rows, taken);
    expect(dropIds).toEqual(["f1"]);
    expect(moveIds).toEqual(["f2"]);
    expect(taken.has("c2")).toBe(true);
  });

  it("два старі з одним customerId (група 3+): перший move, другий drop", () => {
    const taken = new Set<string>();
    const rows = [
      { id: "x", customerId: "cX" },
      { id: "y", customerId: "cX" },
    ];
    const { moveIds, dropIds } = splitByCustomer(rows, taken);
    expect(moveIds).toEqual(["x"]);
    expect(dropIds).toEqual(["y"]);
  });
});

describe("splitPricesByKey — дедуп (priceType, validFrom)", () => {
  it("той самий ключ, що у survivor → конфлікт; інший → move", () => {
    const d1 = new Date("2022-01-01T00:00:00Z");
    const d2 = new Date("2022-06-01T00:00:00Z");
    const taken = new Set<string>([`wholesale|${d1.toISOString()}`]);
    const rows = [
      { id: "pr1", priceType: "wholesale", validFrom: d1 }, // конфлікт
      { id: "pr2", priceType: "wholesale", validFrom: d2 }, // move
      { id: "pr3", priceType: "akciya", validFrom: d1 }, // move (інший тип)
    ];
    const { moveIds, conflictIds } = splitPricesByKey(rows, taken);
    expect(conflictIds).toEqual(["pr1"]);
    expect(moveIds).toEqual(["pr2", "pr3"]);
  });

  it("два старі з однаковим ключем: перший move, другий конфлікт", () => {
    const d = new Date("2022-01-01T00:00:00Z");
    const taken = new Set<string>();
    const rows = [
      { id: "a", priceType: "wholesale", validFrom: d },
      { id: "b", priceType: "wholesale", validFrom: d },
    ];
    const { moveIds, conflictIds } = splitPricesByKey(rows, taken);
    expect(moveIds).toEqual(["a"]);
    expect(conflictIds).toEqual(["b"]);
  });
});
