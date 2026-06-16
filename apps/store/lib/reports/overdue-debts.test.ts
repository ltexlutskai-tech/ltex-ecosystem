import { describe, it, expect } from "vitest";
import { computeOverdueEur, type DebtMovementLite } from "./overdue-debts";

const NOW = new Date("2026-06-16T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function mv(days: number, amount: number): DebtMovementLite {
  return { occurredAt: daysAgo(days), amountEur: amount };
}

describe("computeOverdueEur", () => {
  it("один старий борг без оплат → overdue = борг", () => {
    expect(computeOverdueEur([mv(30, 100)], 14, NOW)).toBe(100);
  });

  it("свіжий борг (молодший за поріг) → overdue = 0", () => {
    expect(computeOverdueEur([mv(5, 100)], 14, NOW)).toBe(0);
  });

  it("старий борг + свіжа повна оплата → overdue = 0 (FIFO гасить старий)", () => {
    expect(computeOverdueEur([mv(30, 100), mv(1, -100)], 14, NOW)).toBe(0);
  });

  it("старий борг + часткова оплата → overdue = залишок", () => {
    expect(computeOverdueEur([mv(30, 100), mv(1, -40)], 14, NOW)).toBe(60);
  });

  it("оплата більша за борг (переплата) → overdue = 0, не від'ємний", () => {
    expect(computeOverdueEur([mv(30, 100), mv(1, -150)], 14, NOW)).toBe(0);
  });

  it("два борги різних дат + одна оплата → гаситься найстаріший першим", () => {
    // 200 (40 днів) + 100 (20 днів), оплата 200 (свіжа).
    // FIFO: гасить весь старий (200), лишається 100 від 20-денного → прострочене.
    const movs = [mv(40, 200), mv(20, 100), mv(1, -200)];
    expect(computeOverdueEur(movs, 14, NOW)).toBe(100);
  });

  it("оплата частково перетікає на наступний дебет (FIFO)", () => {
    // 50 (40 днів) + 100 (30 днів), оплата 80 → гасить весь перший (50)
    // + 30 з другого → лишається 70 (старший за поріг) = прострочене.
    const movs = [mv(40, 50), mv(30, 100), mv(1, -80)];
    expect(computeOverdueEur(movs, 14, NOW)).toBe(70);
  });

  it("нульові рухи ігноруються", () => {
    expect(computeOverdueEur([mv(30, 0), mv(30, 100)], 14, NOW)).toBe(100);
  });

  it("неупорядкований вхід сортується перед FIFO", () => {
    // Та сама логіка що й тест 6, але рухи у випадковому порядку.
    const movs = [mv(1, -200), mv(20, 100), mv(40, 200)];
    expect(computeOverdueEur(movs, 14, NOW)).toBe(100);
  });

  it("свіжий старий борг частково прострочений за межею порогу", () => {
    // борг 100 точно на порозі (15 днів, поріг 14) → прострочений.
    expect(computeOverdueEur([mv(15, 100)], 14, NOW)).toBe(100);
    // борг 100 молодший за поріг (14 днів, поріг 14) → не прострочений
    // (cutoff = -14д, date < cutoff хибне коли рівні).
    expect(computeOverdueEur([mv(14, 100)], 14, NOW)).toBe(0);
  });
});
