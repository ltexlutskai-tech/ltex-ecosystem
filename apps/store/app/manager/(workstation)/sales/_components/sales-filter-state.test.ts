import { describe, it, expect } from "vitest";
import {
  isValidIsoDate,
  salesFilterToQueryString,
  parseSalesFilterFromSearchParams,
} from "./sales-filter-state";

describe("parseSalesFilterFromSearchParams", () => {
  it("returns defaults when empty", () => {
    const s = parseSalesFilterFromSearchParams({});
    expect(s.search).toBe("");
    expect(s.status).toBe("");
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
    expect(s.showArchived).toBe(false);
  });

  it("ignores unknown status, accepts whitelisted", () => {
    expect(parseSalesFilterFromSearchParams({ status: "haxxor" }).status).toBe(
      "",
    );
    expect(parseSalesFilterFromSearchParams({ status: "posted" }).status).toBe(
      "posted",
    );
  });

  it("trims search whitespace", () => {
    expect(
      parseSalesFilterFromSearchParams({ search: "  test  " }).search,
    ).toBe("test");
  });

  it("clamps pageSize to [10..100]", () => {
    expect(parseSalesFilterFromSearchParams({ pageSize: "5" }).pageSize).toBe(
      20,
    );
    expect(parseSalesFilterFromSearchParams({ pageSize: "500" }).pageSize).toBe(
      20,
    );
    expect(parseSalesFilterFromSearchParams({ pageSize: "50" }).pageSize).toBe(
      50,
    );
  });

  it("preserves clientCode1C and parses showArchived=true", () => {
    const s = parseSalesFilterFromSearchParams({
      clientCode1C: "000001",
      showArchived: "true",
    });
    expect(s.clientCode1C).toBe("000001");
    expect(s.showArchived).toBe(true);
  });
});

describe("salesFilterToQueryString", () => {
  it("omits defaults", () => {
    expect(salesFilterToQueryString({ page: 1, pageSize: 20 })).toBe("");
  });

  it("emits non-default values (round-trip)", () => {
    const qs = salesFilterToQueryString({
      search: "x",
      status: "sent",
      page: 2,
      pageSize: 50,
      showArchived: true,
    });
    const parsed = parseSalesFilterFromSearchParams(
      Object.fromEntries(new URLSearchParams(qs)),
    );
    expect(parsed.search).toBe("x");
    expect(parsed.status).toBe("sent");
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
    expect(parsed.showArchived).toBe(true);
  });

  it("emits showArchived only when true", () => {
    expect(salesFilterToQueryString({ showArchived: false })).not.toContain(
      "showArchived",
    );
    expect(salesFilterToQueryString({ showArchived: true })).toContain(
      "showArchived=true",
    );
  });
});

describe("isValidIsoDate", () => {
  it("returns false for empty / garbage, true for ISO", () => {
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("2026-05-15")).toBe(true);
  });
});
