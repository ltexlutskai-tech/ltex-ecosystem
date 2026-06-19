import { describe, it, expect } from "vitest";
import {
  collectCategorySubtreeIds,
  collectHiddenCategoryIds,
  type CategoryNode,
} from "./category-tree";

// Дерево:
//   root (a)
//    ├─ b
//    │   └─ d
//    └─ c
//   окремий корінь e
const NODES: CategoryNode[] = [
  { id: "a", parentId: null },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "a" },
  { id: "d", parentId: "b" },
  { id: "e", parentId: null },
];

describe("collectCategorySubtreeIds", () => {
  it("збирає корінь + усіх нащадків", () => {
    const ids = collectCategorySubtreeIds("a", NODES);
    expect(ids).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("піддерево середнього вузла", () => {
    expect(collectCategorySubtreeIds("b", NODES)).toEqual(new Set(["b", "d"]));
  });

  it("лист повертає лише себе", () => {
    expect(collectCategorySubtreeIds("d", NODES)).toEqual(new Set(["d"]));
  });

  it("відсутній id повертає лише сам id", () => {
    expect(collectCategorySubtreeIds("zzz", NODES)).toEqual(new Set(["zzz"]));
  });

  it("захищено від циклів (a↔b)", () => {
    const cyclic: CategoryNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(collectCategorySubtreeIds("a", cyclic)).toEqual(new Set(["a", "b"]));
  });
});

describe("collectHiddenCategoryIds", () => {
  it("приховує піддерево, де роль у hiddenForRoles", () => {
    const nodes: CategoryNode[] = [
      { id: "a", parentId: null },
      { id: "b", parentId: "a", hiddenForRoles: ["warehouse"] },
      { id: "d", parentId: "b" },
      { id: "c", parentId: "a" },
    ];
    // warehouse не бачить b та її нащадка d, але бачить a і c.
    expect(collectHiddenCategoryIds("warehouse", nodes)).toEqual(
      new Set(["b", "d"]),
    );
  });

  it("спадковість: предок прихований → нащадки приховані", () => {
    const nodes: CategoryNode[] = [
      { id: "root", parentId: null, hiddenForRoles: ["expeditor"] },
      { id: "child", parentId: "root" },
      { id: "grand", parentId: "child" },
    ];
    expect(collectHiddenCategoryIds("expeditor", nodes)).toEqual(
      new Set(["root", "child", "grand"]),
    );
  });

  it("порожньо коли роль ніде не у deny-list", () => {
    expect(collectHiddenCategoryIds("manager", NODES)).toEqual(new Set());
  });

  it("кілька прихованих коренів обʼєднуються", () => {
    const nodes: CategoryNode[] = [
      { id: "a", parentId: null, hiddenForRoles: ["r"] },
      { id: "b", parentId: null, hiddenForRoles: ["r"] },
      { id: "c", parentId: "a" },
    ];
    expect(collectHiddenCategoryIds("r", nodes)).toEqual(
      new Set(["a", "b", "c"]),
    );
  });
});
