import { describe, it, expect } from "vitest";
import { buildCategoryTreeOptions, resolveCategoryAccess } from "./load-prices";
import { buildCategoryPath } from "./load-product";

describe("buildCategoryTreeOptions", () => {
  it("DFS-порядок з глибиною (батько перед нащадками)", () => {
    const opts = buildCategoryTreeOptions([
      { id: "a", name: "Clothes", parentId: null },
      { id: "b", name: "Women", parentId: "a" },
      { id: "d", name: "Dresses", parentId: "b" },
      { id: "c", name: "Shoes", parentId: null },
    ]);
    // Корінь відсортований по name: Clothes < Shoes; нащадки одразу за батьком.
    expect(opts.map((o) => `${o.depth}:${o.name}`)).toEqual([
      "0:Clothes",
      "1:Women",
      "2:Dresses",
      "0:Shoes",
    ]);
  });

  it("сирота (parent поза набором) → корінь", () => {
    const opts = buildCategoryTreeOptions([
      { id: "x", name: "Орфан", parentId: "missing" },
    ]);
    expect(opts).toEqual([{ id: "x", name: "Орфан", depth: 0 }]);
  });

  it("захищено від циклів", () => {
    const opts = buildCategoryTreeOptions([
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ]);
    // Жоден не корінь (обидва мають батька) → нічого не виводиться.
    expect(opts).toEqual([]);
  });
});

describe("buildCategoryPath", () => {
  it("розгортає шлях корінь→лист", () => {
    expect(
      buildCategoryPath({
        name: "Сукні",
        parent: { name: "Жіночий", parent: { name: "Одяг", parent: null } },
      }),
    ).toEqual(["Одяг", "Жіночий", "Сукні"]);
  });

  it("null → порожній масив", () => {
    expect(buildCategoryPath(null)).toEqual([]);
  });

  it("одна категорія без батька", () => {
    expect(buildCategoryPath({ name: "Іграшки" })).toEqual(["Іграшки"]);
  });
});

describe("resolveCategoryAccess", () => {
  const nodes = [
    { id: "a", parentId: null, hiddenForRoles: [] },
    { id: "b", parentId: "a", hiddenForRoles: ["warehouse"] },
    { id: "d", parentId: "b", hiddenForRoles: [] },
  ];

  it("manager → піддерево + приховані", () => {
    const r = resolveCategoryAccess(nodes, {
      categoryId: "a",
      role: "warehouse",
    });
    expect(new Set(r.categorySubtreeIds)).toEqual(new Set(["a", "b", "d"]));
    expect(new Set(r.hiddenCategoryIds)).toEqual(new Set(["b", "d"]));
  });

  it("admin → hiddenCategoryIds undefined (bypass)", () => {
    const r = resolveCategoryAccess(nodes, { role: "admin" });
    expect(r.hiddenCategoryIds).toBeUndefined();
  });

  it("owner → bypass", () => {
    const r = resolveCategoryAccess(nodes, { role: "owner" });
    expect(r.hiddenCategoryIds).toBeUndefined();
  });

  it("без прихованих для ролі → undefined", () => {
    const r = resolveCategoryAccess(nodes, { role: "manager" });
    expect(r.hiddenCategoryIds).toBeUndefined();
    expect(r.categorySubtreeIds).toBeUndefined();
  });
});
