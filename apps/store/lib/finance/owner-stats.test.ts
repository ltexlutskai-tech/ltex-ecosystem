import { describe, it, expect } from "vitest";
import { resolvePeriod } from "./owner-stats";

describe("resolvePeriod", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("today — від початку дня", () => {
    const p = resolvePeriod("today", now);
    expect(p.from.getHours()).toBe(0);
    expect(p.from.getMinutes()).toBe(0);
    expect(p.from.getDate()).toBe(15);
    expect(p.label).toBe("Сьогодні");
  });

  it("week — 7 днів назад", () => {
    const p = resolvePeriod("week", now);
    const diff = (p.to.getTime() - p.from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBeCloseTo(7, 0);
    expect(p.label).toBe("Останній тиждень");
  });

  it("month — 1 місяць назад", () => {
    const p = resolvePeriod("month", now);
    expect(p.from.getMonth()).toBe(4); // May (місяць тому з June)
    expect(p.label).toBe("Останній місяць");
  });

  it("year — 1 рік назад", () => {
    const p = resolvePeriod("year", now);
    expect(p.from.getFullYear()).toBe(2025);
    expect(p.label).toBe("Останній рік");
  });

  it("all — з 2020", () => {
    const p = resolvePeriod("all", now);
    expect(p.from.getFullYear()).toBe(2020);
    expect(p.label).toBe("Весь час");
  });
});
