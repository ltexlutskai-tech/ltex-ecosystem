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

  it("defaults sort to 'date' and dir to 'desc'", () => {
    const s = parseSalesFilterFromSearchParams({});
    expect(s.sort).toBe("date");
    expect(s.dir).toBe("desc");
  });

  it("parses whitelisted sort + dir, ignores unknown sort", () => {
    const ok = parseSalesFilterFromSearchParams({ sort: "agent", dir: "asc" });
    expect(ok.sort).toBe("agent");
    expect(ok.dir).toBe("asc");
    const bad = parseSalesFilterFromSearchParams({ sort: "haxxor" });
    expect(bad.sort).toBe("date");
  });

  it("treats non-'asc' dir as 'desc'", () => {
    expect(parseSalesFilterFromSearchParams({ dir: "sideways" }).dir).toBe(
      "desc",
    );
    expect(parseSalesFilterFromSearchParams({ dir: "asc" }).dir).toBe("asc");
  });

  it("parses per-column filters (clientName/city/agent)", () => {
    const s = parseSalesFilterFromSearchParams({
      clientName: "  Іван  ",
      city: "Луцьк",
      agent: "Петренко",
    });
    expect(s.clientName).toBe("Іван");
    expect(s.city).toBe("Луцьк");
    expect(s.agent).toBe("Петренко");
  });

  it("defaults per-column filters to empty strings", () => {
    const s = parseSalesFilterFromSearchParams({});
    expect(s.clientName).toBe("");
    expect(s.city).toBe("");
    expect(s.agent).toBe("");
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

  it("omits default sort/dir, emits non-default", () => {
    expect(salesFilterToQueryString({ sort: "date", dir: "desc" })).toBe("");
    const qs = salesFilterToQueryString({ sort: "agent", dir: "asc" });
    expect(qs).toContain("sort=agent");
    expect(qs).toContain("dir=asc");
  });

  it("emits per-column filters", () => {
    const qs = salesFilterToQueryString({
      clientName: "Іван",
      city: "Луцьк",
      agent: "Петренко",
    });
    expect(qs).toContain("clientName=");
    expect(qs).toContain("city=");
    expect(qs).toContain("agent=");
  });
});

describe("isValidIsoDate", () => {
  it("returns false for empty / garbage, true for ISO", () => {
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate("2026-05-15")).toBe(true);
  });
});
