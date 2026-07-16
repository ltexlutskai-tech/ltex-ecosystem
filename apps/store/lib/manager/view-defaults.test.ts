import { describe, expect, it } from "vitest";
import {
  CLIENTS_FILTERS_DEFAULT,
  CLIENTS_FILTERS_KEYS,
  CLIENTS_TABLE_DEFAULT,
  CLIENTS_TABLE_KEYS,
  getAllKeysFor,
  getDefaultsFor,
  isViewKey,
  mergePrefs,
} from "./view-defaults";

describe("view-defaults", () => {
  it("empty saved → returns defaults + auto-appended invisibles", () => {
    const out = mergePrefs(null, CLIENTS_TABLE_DEFAULT, CLIENTS_TABLE_KEYS);
    expect(out.length).toBe(CLIENTS_TABLE_KEYS.length);
    // Перші N — visible (дефолтні), решта — invisible.
    const visibleCount = CLIENTS_TABLE_DEFAULT.length;
    expect(out.slice(0, visibleCount).every((i) => i.visible)).toBe(true);
    expect(out.slice(visibleCount).every((i) => !i.visible)).toBe(true);
    // Order безперервний 1..n
    expect(out[0]?.order).toBe(1);
    expect(out[out.length - 1]?.order).toBe(CLIENTS_TABLE_KEYS.length);
  });

  it("saved partial → merge: known keys stay, missing keys appended invisible", () => {
    const saved = [
      { key: "debt", visible: true, order: 1 },
      { key: "name", visible: true, order: 2 },
    ];
    const out = mergePrefs(saved, CLIENTS_TABLE_DEFAULT, CLIENTS_TABLE_KEYS);
    expect(out.length).toBe(CLIENTS_TABLE_KEYS.length);
    expect(out[0]).toEqual({ key: "debt", visible: true, order: 1 });
    expect(out[1]).toEqual({ key: "name", visible: true, order: 2 });
    // Решта — нові auto-appended, всі invisible
    expect(out.slice(2).every((i) => !i.visible)).toBe(true);
    expect(out.slice(2).map((i) => i.key)).toEqual(
      CLIENTS_TABLE_KEYS.filter((k) => k !== "debt" && k !== "name"),
    );
  });

  it("unknown key у saved — dropped", () => {
    const saved = [
      { key: "name", visible: true, order: 1 },
      { key: "bogusKeyXYZ", visible: true, order: 2 },
      { key: "debt", visible: false, order: 3 },
    ];
    const out = mergePrefs(saved, CLIENTS_TABLE_DEFAULT, CLIENTS_TABLE_KEYS);
    expect(out.map((i) => i.key)).not.toContain("bogusKeyXYZ");
    expect(out.find((i) => i.key === "name")?.visible).toBe(true);
    expect(out.find((i) => i.key === "debt")?.visible).toBe(false);
  });

  it("new key з'явився у allKeys — auto-appended з visible=false", () => {
    const saved = CLIENTS_TABLE_DEFAULT.map((i, idx) => ({
      ...i,
      order: idx + 1,
    }));
    // Симулюємо що "createdAt" з'явився у allKeys уже після того як user зберіг prefs
    const allKeysExtended = [...CLIENTS_TABLE_KEYS, "newFutureKey"] as const;
    const out = mergePrefs(saved, CLIENTS_TABLE_DEFAULT, allKeysExtended);
    expect(out.find((i) => i.key === "newFutureKey")).toEqual({
      key: "newFutureKey",
      visible: false,
      order: out.length,
    });
  });

  it("duplicates у saved — перше входження кеп", () => {
    const saved = [
      { key: "name", visible: true, order: 1 },
      { key: "name", visible: false, order: 2 },
    ];
    const out = mergePrefs(saved, CLIENTS_TABLE_DEFAULT, CLIENTS_TABLE_KEYS);
    const nameItems = out.filter((i) => i.key === "name");
    expect(nameItems.length).toBe(1);
    expect(nameItems[0]?.visible).toBe(true);
  });

  it("getAllKeysFor + getDefaultsFor return right shape per viewKey", () => {
    expect(getAllKeysFor("clients_table")).toBe(CLIENTS_TABLE_KEYS);
    expect(getAllKeysFor("clients_filters")).toBe(CLIENTS_FILTERS_KEYS);
    expect(getDefaultsFor("clients_table").length).toBe(
      CLIENTS_TABLE_DEFAULT.length,
    );
    expect(getDefaultsFor("clients_filters").length).toBe(
      CLIENTS_FILTERS_DEFAULT.length,
    );
  });

  it("isViewKey type-guard correctness", () => {
    expect(isViewKey("clients_table")).toBe(true);
    expect(isViewKey("clients_filters")).toBe(true);
    expect(isViewKey("orders_table")).toBe(false);
    expect(isViewKey("")).toBe(false);
  });
});
