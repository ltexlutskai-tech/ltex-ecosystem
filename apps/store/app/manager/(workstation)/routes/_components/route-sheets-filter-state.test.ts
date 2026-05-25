import { describe, it, expect } from "vitest";
import {
  parseRouteSheetsFilterFromSearchParams,
  routeSheetsFilterToQueryString,
} from "./route-sheets-filter-state";

describe("parseRouteSheetsFilterFromSearchParams", () => {
  it("returns defaults when empty", () => {
    const s = parseRouteSheetsFilterFromSearchParams({});
    expect(s.search).toBe("");
    expect(s.status).toBe("");
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
    expect(s.archived).toBe(false);
  });

  it("ignores unknown status, accepts whitelisted", () => {
    expect(
      parseRouteSheetsFilterFromSearchParams({ status: "haxxor" }).status,
    ).toBe("");
    expect(
      parseRouteSheetsFilterFromSearchParams({ status: "dispatched" }).status,
    ).toBe("dispatched");
    expect(
      parseRouteSheetsFilterFromSearchParams({ status: "completed" }).status,
    ).toBe("completed");
  });

  it("trims search whitespace and parses archived=true", () => {
    const s = parseRouteSheetsFilterFromSearchParams({
      search: "  МЛ-1  ",
      archived: "true",
    });
    expect(s.search).toBe("МЛ-1");
    expect(s.archived).toBe(true);
  });

  it("clamps pageSize to [10..100]", () => {
    expect(
      parseRouteSheetsFilterFromSearchParams({ pageSize: "5" }).pageSize,
    ).toBe(20);
    expect(
      parseRouteSheetsFilterFromSearchParams({ pageSize: "500" }).pageSize,
    ).toBe(20);
    expect(
      parseRouteSheetsFilterFromSearchParams({ pageSize: "50" }).pageSize,
    ).toBe(50);
  });
});

describe("routeSheetsFilterToQueryString", () => {
  it("omits defaults", () => {
    expect(routeSheetsFilterToQueryString({ page: 1, pageSize: 20 })).toBe("");
  });

  it("emits non-default values (round-trip)", () => {
    const qs = routeSheetsFilterToQueryString({
      search: "x",
      status: "dispatched",
      page: 2,
      pageSize: 50,
      archived: true,
    });
    const parsed = parseRouteSheetsFilterFromSearchParams(
      Object.fromEntries(new URLSearchParams(qs)),
    );
    expect(parsed.search).toBe("x");
    expect(parsed.status).toBe("dispatched");
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
    expect(parsed.archived).toBe(true);
  });

  it("emits archived only when true", () => {
    expect(routeSheetsFilterToQueryString({ archived: false })).not.toContain(
      "archived",
    );
    expect(routeSheetsFilterToQueryString({ archived: true })).toContain(
      "archived=true",
    );
  });
});
