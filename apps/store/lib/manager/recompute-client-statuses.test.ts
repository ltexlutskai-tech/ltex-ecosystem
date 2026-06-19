import { describe, it, expect } from "vitest";

import {
  classifyStatus,
  currentMonthRange,
  prevMonthRange,
  startOfDayUTC,
  startOfMonthUTC,
} from "./recompute-client-statuses";

describe("classifyStatus", () => {
  it("0 продажів → Неактивний", () => {
    expect(classifyStatus(0, false, false)).toBe("inactive");
  });

  it("1 продаж → Малоактивний", () => {
    expect(classifyStatus(1, false, false)).toBe("low");
  });

  it("2 продажі → Активний (межа)", () => {
    expect(classifyStatus(2, false, false)).toBe("active");
  });

  it(">2 продажів → Активний", () => {
    expect(classifyStatus(5, false, false)).toBe("active");
  });

  it("новий клієнт (isNew) → Потенційний незалежно від продажів", () => {
    expect(classifyStatus(0, true, false)).toBe("potential");
    expect(classifyStatus(3, true, false)).toBe("potential");
  });

  it("0 продажів + поточний Потенційний → не перебивати (null)", () => {
    expect(classifyStatus(0, false, true)).toBeNull();
  });

  it("1 продаж + поточний Потенційний → Малоактивний (перебиває)", () => {
    expect(classifyStatus(1, false, true)).toBe("low");
  });

  it("2 продажі + поточний Потенційний → Активний (перебиває)", () => {
    expect(classifyStatus(2, false, true)).toBe("active");
  });
});

describe("date ranges (UTC)", () => {
  it("startOfMonthUTC обнуляє день/час", () => {
    const d = new Date(Date.UTC(2026, 5, 17, 13, 30, 0));
    expect(startOfMonthUTC(d).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("currentMonthRange = [перше число цього міс, перше число наступного)", () => {
    const now = new Date(Date.UTC(2026, 5, 17));
    const r = currentMonthRange(now);
    expect(r.start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("prevMonthRange = [перше число минулого міс, перше число цього)", () => {
    const now = new Date(Date.UTC(2026, 5, 17));
    const r = prevMonthRange(now);
    expect(r.start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("prevMonthRange коректно переходить через рік (січень → грудень)", () => {
    const now = new Date(Date.UTC(2026, 0, 15));
    const r = prevMonthRange(now);
    expect(r.start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("startOfDayUTC дає початок дня — ключ історії", () => {
    const d = new Date(Date.UTC(2026, 5, 17, 23, 59, 59));
    expect(startOfDayUTC(d).toISOString()).toBe("2026-06-17T00:00:00.000Z");
  });
});
