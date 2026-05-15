import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  stateToUrl,
  urlToState,
} from "./clients-filter-state";

describe("clients-filter-state", () => {
  it("roundtrip empty → empty", () => {
    const sp = new URLSearchParams();
    const state = urlToState(sp);
    const out = stateToUrl(state);
    expect(out.toString()).toBe("");
  });

  it("parses multi-csv into arrays", () => {
    const sp = new URLSearchParams("statusId=a,b,c&categoryTTId=x,y");
    const state = urlToState(sp);
    expect(state.statusGeneralIds).toEqual(["a", "b", "c"]);
    expect(state.categoryTTIds).toEqual(["x", "y"]);
  });

  it("parses ranges + dates", () => {
    const sp = new URLSearchParams(
      "debtMin=100&debtMax=5000&createdFrom=2026-01-01&createdTo=2026-12-31",
    );
    const state = urlToState(sp);
    expect(state.debtMin).toBe(100);
    expect(state.debtMax).toBe(5000);
    expect(state.createdFrom).toBe("2026-01-01");
    expect(state.createdTo).toBe("2026-12-31");
  });

  it("parses booleans", () => {
    const sp = new URLSearchParams(
      "hasNewMessage=true&isViberLinked=false&hasDebt=true",
    );
    const state = urlToState(sp);
    expect(state.hasNewMessage).toBe(true);
    expect(state.isViberLinked).toBe(false);
    expect(state.hasDebt).toBe(true);
  });

  it("ignores unknown params (no leakage)", () => {
    const sp = new URLSearchParams("statusId=a&unknownXYZ=foo");
    const state = urlToState(sp);
    // Unknown key — взагалі не з'являється у state
    expect(Object.keys(state)).not.toContain("unknownXYZ");
  });

  it("roundtrip non-trivial state", () => {
    const sp = new URLSearchParams();
    sp.set("statusId", "s1,s2");
    sp.set("debtMin", "100");
    sp.set("region", "Київська");
    sp.set("hasNewMessage", "true");
    const state = urlToState(sp);
    const out = stateToUrl(state);
    expect(out.get("statusId")).toBe("s1,s2");
    expect(out.get("debtMin")).toBe("100");
    expect(out.get("region")).toBe("Київська");
    expect(out.get("hasNewMessage")).toBe("true");
  });

  it("countActiveFilters counts unique groups", () => {
    const state = {
      search: "abc", // not counted
      statusGeneralIds: ["a"],
      categoryTTIds: ["x", "y"],
      debtMin: 100,
      debtMax: 5000, // counted once with debtMin
      region: "Київська",
      hasNewMessage: true,
      hasDebt: true,
      onlyMine: true, // not counted
      hideTrash: true, // not counted
    };
    expect(countActiveFilters(state)).toBe(6);
  });

  it("countActiveFilters returns 0 for empty state", () => {
    expect(countActiveFilters({})).toBe(0);
  });

  it("stateToUrl drops undefined values", () => {
    const out = stateToUrl({
      search: undefined,
      statusGeneralIds: [],
      debtMin: undefined,
    });
    expect(out.toString()).toBe("");
  });

  it("preserves base params not handled by state mapping", () => {
    const base = new URLSearchParams("page=2&unknownXYZ=foo");
    const out = stateToUrl({ search: "abc" }, base);
    expect(out.get("page")).toBe("2");
    expect(out.get("unknownXYZ")).toBe("foo");
    expect(out.get("search")).toBe("abc");
  });
});
