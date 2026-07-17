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
      "daysSinceMin=5&daysSinceMax=90&createdFrom=2026-01-01&createdTo=2026-12-31",
    );
    const state = urlToState(sp);
    expect(state.daysSinceMin).toBe(5);
    expect(state.daysSinceMax).toBe(90);
    expect(state.createdFrom).toBe("2026-01-01");
    expect(state.createdTo).toBe("2026-12-31");
  });

  it("parses region/city as free text (contains)", () => {
    const sp = new URLSearchParams("region=Волин&city=Луцьк");
    const state = urlToState(sp);
    expect(state.region).toBe("Волин");
    expect(state.city).toBe("Луцьк");
  });

  it("parses booleans", () => {
    const sp = new URLSearchParams("hasDebt=true&hasOverpayment=false");
    const state = urlToState(sp);
    expect(state.hasDebt).toBe(true);
    expect(state.hasOverpayment).toBe(false);
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
    sp.set("daysSinceMin", "10");
    sp.set("region", "Волин");
    sp.set("hasDebt", "true");
    const state = urlToState(sp);
    const out = stateToUrl(state);
    expect(out.get("statusId")).toBe("s1,s2");
    expect(out.get("daysSinceMin")).toBe("10");
    expect(out.get("region")).toBe("Волин");
    expect(out.get("hasDebt")).toBe("true");
  });

  it("countActiveFilters counts unique groups", () => {
    const state = {
      search: "abc", // not counted
      statusGeneralIds: ["a"],
      categoryTTIds: ["x", "y"],
      daysSinceMin: 10,
      daysSinceMax: 90, // counted once with daysSinceMin
      region: "Волин",
      hasDebt: true,
      onlyMine: true, // not counted
      hideTrash: true, // not counted
    };
    expect(countActiveFilters(state)).toBe(5);
  });

  it("countActiveFilters returns 0 for empty state", () => {
    expect(countActiveFilters({})).toBe(0);
  });

  it("парсить нові зрізи: color / keywords / historySearch / assortment", () => {
    const sp = new URLSearchParams(
      "colors=stale,green&keywords=опт,дитяче&keywordsOr=true&historySearch=дзвінок&assortmentSearch=куртка",
    );
    const state = urlToState(sp);
    expect(state.colors).toEqual(["stale", "green"]);
    expect(state.keywords).toEqual(["опт", "дитяче"]);
    expect(state.keywordsOr).toBe(true);
    expect(state.historySearch).toBe("дзвінок");
    expect(state.assortmentSearch).toBe("куртка");
  });

  it("roundtrip нових зрізів через stateToUrl", () => {
    const state = {
      colors: ["today"],
      keywords: ["vip"],
      historySearch: "оплата",
      assortmentSearch: "взуття",
    };
    const out = stateToUrl(state);
    expect(out.get("colors")).toBe("today");
    expect(out.get("keywords")).toBe("vip");
    expect(out.get("historySearch")).toBe("оплата");
    expect(out.get("assortmentSearch")).toBe("взуття");
  });

  it("countActiveFilters НЕ рахує окремі верхньорівневі зрізи (color/keywords/history/assortment)", () => {
    expect(
      countActiveFilters({
        colors: ["stale"],
        keywords: ["опт"],
        historySearch: "дзвінок",
        assortmentSearch: "куртка",
      }),
    ).toBe(0);
  });

  it("stateToUrl drops undefined values", () => {
    const out = stateToUrl({
      search: undefined,
      statusGeneralIds: [],
      daysSinceMin: undefined,
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
