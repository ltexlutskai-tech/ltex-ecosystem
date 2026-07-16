import { describe, expect, it } from "vitest";
import {
  buildColorWhere,
  computeClientColor,
  isClientColor,
  startOfDay,
} from "./client-color";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const day = 86_400_000;

describe("computeClientColor", () => {
  it("активне замовлення → green (перекриває давність)", () => {
    expect(
      computeClientColor({
        hasActiveOrder: true,
        lastContactAt: new Date(NOW.getTime() - 100 * day),
        now: NOW,
      }),
    ).toBe("green");
  });

  it("немає жодного контакту → never", () => {
    expect(
      computeClientColor({
        hasActiveOrder: false,
        lastContactAt: null,
        now: NOW,
      }),
    ).toBe("never");
  });

  it("контакт сьогодні → today", () => {
    const todayMorning = startOfDay(NOW);
    expect(
      computeClientColor({
        hasActiveOrder: false,
        lastContactAt: todayMorning,
        now: NOW,
      }),
    ).toBe("today");
  });

  it("контакт 3 дні тому → week", () => {
    expect(
      computeClientColor({
        hasActiveOrder: false,
        lastContactAt: new Date(NOW.getTime() - 3 * day),
        now: NOW,
      }),
    ).toBe("week");
  });

  it("контакт 10 днів тому → fortnight", () => {
    expect(
      computeClientColor({
        hasActiveOrder: false,
        lastContactAt: new Date(NOW.getTime() - 10 * day),
        now: NOW,
      }),
    ).toBe("fortnight");
  });

  it("контакт 20 днів тому → stale", () => {
    expect(
      computeClientColor({
        hasActiveOrder: false,
        lastContactAt: new Date(NOW.getTime() - 20 * day),
        now: NOW,
      }),
    ).toBe("stale");
  });
});

describe("isClientColor", () => {
  it("валідні/невалідні значення", () => {
    expect(isClientColor("stale")).toBe(true);
    expect(isClientColor("green")).toBe(true);
    expect(isClientColor("purple")).toBe(false);
    expect(isClientColor("")).toBe(false);
  });
});

describe("buildColorWhere", () => {
  it("порожній список → null", () => {
    expect(buildColorWhere([], [], NOW)).toBeNull();
  });

  it("never → немає жодного запису історії (як 1С)", () => {
    const w = buildColorWhere(["never"], [], NOW);
    expect(w).toEqual({ OR: [{ timeline: { none: {} } }] });
  });

  it("green → фільтр по code1C з активних замовлень", () => {
    const w = buildColorWhere(["green"], ["A1", "B2"], NOW);
    expect(w).toEqual({ OR: [{ code1C: { in: ["A1", "B2"] } }] });
  });

  it("stale → є активність, але не за 14 днів", () => {
    const w = buildColorWhere(["stale"], [], NOW);
    const clause = (w as { OR: Array<{ AND?: unknown[] }> }).OR[0];
    expect(clause?.AND).toBeDefined();
    expect(clause?.AND).toHaveLength(2);
  });

  it("кілька кольорів → OR з кількома клаузами", () => {
    const w = buildColorWhere(["today", "stale"], [], NOW);
    expect(w).not.toBeNull();
    expect(Array.isArray((w as { OR: unknown[] }).OR)).toBe(true);
    expect((w as { OR: unknown[] }).OR).toHaveLength(2);
  });
});
