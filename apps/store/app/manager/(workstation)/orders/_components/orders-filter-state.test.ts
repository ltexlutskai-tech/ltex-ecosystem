import { describe, it, expect } from "vitest";
import {
  isValidIsoDate,
  ordersFilterToQueryString,
  parseOrdersFilterFromSearchParams,
} from "./orders-filter-state";

describe("parseOrdersFilterFromSearchParams", () => {
  it("returns defaults when empty", () => {
    const s = parseOrdersFilterFromSearchParams({});
    expect(s.search).toBe("");
    expect(s.status).toBe("");
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
  });

  it("ignores unknown status", () => {
    const s = parseOrdersFilterFromSearchParams({ status: "haxxor" });
    expect(s.status).toBe("");
  });

  it("accepts whitelisted status", () => {
    const s = parseOrdersFilterFromSearchParams({ status: "approved" });
    expect(s.status).toBe("approved");
  });

  it("trims search whitespace", () => {
    const s = parseOrdersFilterFromSearchParams({ search: "  test  " });
    expect(s.search).toBe("test");
  });

  it("clamps pageSize to [10..100]", () => {
    expect(parseOrdersFilterFromSearchParams({ pageSize: "5" }).pageSize).toBe(
      20,
    );
    expect(
      parseOrdersFilterFromSearchParams({ pageSize: "500" }).pageSize,
    ).toBe(20);
    expect(parseOrdersFilterFromSearchParams({ pageSize: "50" }).pageSize).toBe(
      50,
    );
  });

  it("preserves clientCode1C", () => {
    const s = parseOrdersFilterFromSearchParams({ clientCode1C: "000001" });
    expect(s.clientCode1C).toBe("000001");
  });
});

describe("ordersFilterToQueryString", () => {
  it("omits defaults", () => {
    const qs = ordersFilterToQueryString({ page: 1, pageSize: 20 });
    expect(qs).toBe("");
  });

  it("emits non-default values", () => {
    const qs = ordersFilterToQueryString({
      search: "x",
      status: "approved",
      page: 2,
      pageSize: 50,
    });
    expect(qs).toContain("search=x");
    expect(qs).toContain("status=approved");
    expect(qs).toContain("page=2");
    expect(qs).toContain("pageSize=50");
  });

  it("encodes clientCode1C", () => {
    const qs = ordersFilterToQueryString({ clientCode1C: "000001" });
    expect(qs).toContain("clientCode1C=000001");
  });
});

describe("isValidIsoDate", () => {
  it("returns false for empty", () => {
    expect(isValidIsoDate("")).toBe(false);
  });

  it("returns true for ISO date", () => {
    expect(isValidIsoDate("2026-05-15")).toBe(true);
  });

  it("returns false for garbage", () => {
    expect(isValidIsoDate("not-a-date")).toBe(false);
  });
});
