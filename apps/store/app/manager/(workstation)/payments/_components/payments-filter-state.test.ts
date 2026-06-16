import { describe, it, expect } from "vitest";
import {
  parsePaymentsFilterFromSearchParams,
  paymentsFilterToQueryString,
} from "./payments-filter-state";

describe("parsePaymentsFilterFromSearchParams", () => {
  it("returns defaults when empty", () => {
    const s = parsePaymentsFilterFromSearchParams({});
    expect(s.search).toBe("");
    expect(s.type).toBe("");
    expect(s.archived).toBe(false);
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
  });

  it("ignores unknown type, accepts income/expense", () => {
    expect(parsePaymentsFilterFromSearchParams({ type: "x" }).type).toBe("");
    expect(parsePaymentsFilterFromSearchParams({ type: "income" }).type).toBe(
      "income",
    );
    expect(parsePaymentsFilterFromSearchParams({ type: "expense" }).type).toBe(
      "expense",
    );
  });

  it("trims search and parses archived=true", () => {
    const s = parsePaymentsFilterFromSearchParams({
      search: "  №7  ",
      archived: "true",
    });
    expect(s.search).toBe("№7");
    expect(s.archived).toBe(true);
  });

  it("clamps pageSize to [10..100]", () => {
    expect(
      parsePaymentsFilterFromSearchParams({ pageSize: "5" }).pageSize,
    ).toBe(20);
    expect(
      parsePaymentsFilterFromSearchParams({ pageSize: "500" }).pageSize,
    ).toBe(20);
    expect(
      parsePaymentsFilterFromSearchParams({ pageSize: "50" }).pageSize,
    ).toBe(50);
  });

  it("defaults sort to 'date' and dir to 'desc'", () => {
    const s = parsePaymentsFilterFromSearchParams({});
    expect(s.sort).toBe("date");
    expect(s.dir).toBe("desc");
  });

  it("parses whitelisted sort + dir, ignores unknown sort", () => {
    const ok = parsePaymentsFilterFromSearchParams({
      sort: "account",
      dir: "asc",
    });
    expect(ok.sort).toBe("account");
    expect(ok.dir).toBe("asc");
    const bad = parsePaymentsFilterFromSearchParams({ sort: "haxxor" });
    expect(bad.sort).toBe("date");
  });

  it("treats non-'asc' dir as 'desc'", () => {
    expect(parsePaymentsFilterFromSearchParams({ dir: "sideways" }).dir).toBe(
      "desc",
    );
    expect(parsePaymentsFilterFromSearchParams({ dir: "asc" }).dir).toBe("asc");
  });

  it("parses per-column filters (client/article/account)", () => {
    const s = parsePaymentsFilterFromSearchParams({
      client: "  Іван  ",
      article: "Прихід",
      account: "ПриватБанк",
    });
    expect(s.client).toBe("Іван");
    expect(s.article).toBe("Прихід");
    expect(s.account).toBe("ПриватБанк");
  });

  it("defaults per-column filters to empty strings", () => {
    const s = parsePaymentsFilterFromSearchParams({});
    expect(s.client).toBe("");
    expect(s.article).toBe("");
    expect(s.account).toBe("");
  });
});

describe("paymentsFilterToQueryString", () => {
  it("omits defaults", () => {
    expect(paymentsFilterToQueryString({ page: 1, pageSize: 20 })).toBe("");
  });

  it("round-trips non-default values", () => {
    const qs = paymentsFilterToQueryString({
      search: "x",
      type: "expense",
      archived: true,
      page: 2,
      pageSize: 50,
    });
    const parsed = parsePaymentsFilterFromSearchParams(
      Object.fromEntries(new URLSearchParams(qs)),
    );
    expect(parsed.search).toBe("x");
    expect(parsed.type).toBe("expense");
    expect(parsed.archived).toBe(true);
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it("emits archived only when true", () => {
    expect(paymentsFilterToQueryString({ archived: false })).not.toContain(
      "archived",
    );
    expect(paymentsFilterToQueryString({ archived: true })).toContain(
      "archived=true",
    );
  });

  it("omits default sort/dir, emits non-default", () => {
    expect(paymentsFilterToQueryString({ sort: "date", dir: "desc" })).toBe("");
    const qs = paymentsFilterToQueryString({ sort: "account", dir: "asc" });
    expect(qs).toContain("sort=account");
    expect(qs).toContain("dir=asc");
  });

  it("emits per-column filters", () => {
    const qs = paymentsFilterToQueryString({
      client: "Іван",
      article: "Прихід",
      account: "ПриватБанк",
    });
    expect(qs).toContain("client=");
    expect(qs).toContain("article=");
    expect(qs).toContain("account=");
  });
});
