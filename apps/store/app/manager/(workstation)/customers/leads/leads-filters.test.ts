import { describe, it, expect } from "vitest";
import { buildLeadsWhere, normalizeLeadsFilter } from "./leads-filters";

describe("normalizeLeadsFilter", () => {
  it("accepts whitelisted filters", () => {
    expect(normalizeLeadsFilter("converted")).toBe("converted");
    expect(normalizeLeadsFilter("rejected")).toBe("rejected");
    expect(normalizeLeadsFilter("all")).toBe("all");
    expect(normalizeLeadsFilter("active")).toBe("active");
  });

  it("falls back to active on unknown/empty", () => {
    expect(normalizeLeadsFilter("haxxor")).toBe("active");
    expect(normalizeLeadsFilter("")).toBe("active");
    expect(normalizeLeadsFilter(undefined)).toBe("active");
  });
});

describe("buildLeadsWhere — status chips", () => {
  it("default (no filter) → active = status in [new, contacted]", () => {
    const w = buildLeadsWhere({});
    expect(w.status).toEqual({ in: ["new", "contacted"] });
    expect(w.OR).toBeUndefined();
    expect(w.city).toBeUndefined();
    expect(w.source).toBeUndefined();
    expect(w.createdAt).toBeUndefined();
  });

  it("converted → status = converted", () => {
    expect(buildLeadsWhere({ filter: "converted" }).status).toBe("converted");
  });

  it("rejected → status = rejected", () => {
    expect(buildLeadsWhere({ filter: "rejected" }).status).toBe("rejected");
  });

  it("all → no status constraint", () => {
    expect(buildLeadsWhere({ filter: "all" }).status).toBeUndefined();
  });
});

describe("buildLeadsWhere — additional filters", () => {
  it("text search builds OR over name/phone/city (insensitive)", () => {
    const w = buildLeadsWhere({ q: "  Оля  " });
    expect(w.OR).toEqual([
      { name: { contains: "Оля", mode: "insensitive" } },
      { phone: { contains: "Оля", mode: "insensitive" } },
      { city: { contains: "Оля", mode: "insensitive" } },
    ]);
  });

  it("ignores blank/whitespace-only q", () => {
    expect(buildLeadsWhere({ q: "   " }).OR).toBeUndefined();
  });

  it("city and source use exact match", () => {
    const w = buildLeadsWhere({ city: "Луцьк", source: "site" });
    expect(w.city).toBe("Луцьк");
    expect(w.source).toBe("site");
  });

  it("date range: from→gte start-of-day, to→lte end-of-day", () => {
    const w = buildLeadsWhere({ from: "2026-07-01", to: "2026-07-16" });
    const range = w.createdAt as { gte: Date; lte: Date };
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
    expect(range.gte.getTime()).toBeLessThan(range.lte.getTime());
    // "to" включно до кінця доби
    expect(range.lte.getHours()).toBe(23);
    expect(range.lte.getMinutes()).toBe(59);
  });

  it("open-ended range (only from) sets gte, no lte", () => {
    const w = buildLeadsWhere({ from: "2026-07-01" });
    const range = w.createdAt as { gte?: Date; lte?: Date };
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeUndefined();
  });

  it("invalid date strings are ignored", () => {
    expect(
      buildLeadsWhere({ from: "not-a-date", to: "2026/07/16" }).createdAt,
    ).toBeUndefined();
  });

  it("combined: converted + q + city + source + date range AND-combine", () => {
    const w = buildLeadsWhere({
      filter: "converted",
      q: "093",
      city: "Рівне",
      source: "site",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(w.status).toBe("converted");
    expect(w.OR).toHaveLength(3);
    expect(w.city).toBe("Рівне");
    expect(w.source).toBe("site");
    expect(w.createdAt).toBeDefined();
  });
});
