import { describe, it, expect } from "vitest";
import {
  computeOverdue,
  computeOverdueEur,
  type DebtMovementLite,
} from "./overdue-debts";

const NOW = new Date("2026-06-16T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function mv(days: number, amount: number): DebtMovementLite {
  return { occurredAt: daysAgo(days), amountEur: amount };
}

/** Сума всіх рухів — теоретичний загальний борг. */
function sumAmounts(movs: DebtMovementLite[]): number {
  return movs.reduce((s, m) => s + m.amountEur, 0);
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
    const movs = [mv(40, 200), mv(20, 100), mv(1, -200)];
    expect(computeOverdueEur(movs, 14, NOW)).toBe(100);
  });

  it("оплата частково перетікає на наступний дебет (FIFO)", () => {
    const movs = [mv(40, 50), mv(30, 100), mv(1, -80)];
    expect(computeOverdueEur(movs, 14, NOW)).toBe(70);
  });

  it("нульові рухи ігноруються", () => {
    expect(computeOverdueEur([mv(30, 0), mv(30, 100)], 14, NOW)).toBe(100);
  });

  it("неупорядкований вхід сортується перед FIFO", () => {
    const movs = [mv(1, -200), mv(20, 100), mv(40, 200)];
    expect(computeOverdueEur(movs, 14, NOW)).toBe(100);
  });

  it("свіжий старий борг частково прострочений за межею порогу", () => {
    expect(computeOverdueEur([mv(15, 100)], 14, NOW)).toBe(100);
    expect(computeOverdueEur([mv(14, 100)], 14, NOW)).toBe(0);
  });

  it("індивідуальна відстрочка клієнта міняє межу прострочки", () => {
    // 25-денний борг: при глобальному терміні 14 — прострочений,
    // при індивідуальній відстрочці 30 — ще ні.
    expect(computeOverdueEur([mv(25, 100)], 14, NOW)).toBe(100);
    expect(computeOverdueEur([mv(25, 100)], 30, NOW)).toBe(0);
  });
});

describe("computeOverdue — carry-forward кредиту (виправлення бага)", () => {
  it("оплата ПЕРЕД дебетом (передоплата) гасить майбутній борг", () => {
    // Кредит 100 (40 днів тому), потім дебет 100 (30 днів тому).
    // Старий FIFO відкинув би кредит (черга порожня) → overdue=100 > борг=0.
    // Новий: carryCredit=100 гасить дебет → залишок 0.
    const movs = [mv(40, -100), mv(30, 100)];
    const res = computeOverdue(movs, 14, NOW);
    expect(res.totalOpenEur).toBe(0);
    expect(res.overdueEur).toBe(0);
    expect(res.open).toHaveLength(0);
  });

  it("чиста переплата: overdue=0 і не перевищує борг", () => {
    const movs = [mv(30, 100), mv(20, -150)];
    const res = computeOverdue(movs, 14, NOW);
    expect(res.totalOpenEur).toBe(0);
    expect(res.overdueEur).toBe(0);
  });

  it("часткова передоплата: дебет частково покритий carry", () => {
    // -60 (50 днів), потім +100 (30 днів) → carry 60 гасить → лишається 40.
    const movs = [mv(50, -60), mv(30, 100)];
    const res = computeOverdue(movs, 14, NOW);
    expect(res.totalOpenEur).toBe(40);
    expect(res.overdueEur).toBe(40);
    expect(res.open).toHaveLength(1);
    expect(res.open[0]?.remaining).toBe(40);
  });

  it("ГАРАНТІЯ: Σ open.remaining == max(0, Σ amounts) на adversarial входах", () => {
    const cases: DebtMovementLite[][] = [
      [mv(40, -100), mv(30, 100)], // оплата до боргу
      [mv(30, 100), mv(20, -150)], // переплата
      [mv(50, -60), mv(30, 100)], // часткова передоплата
      [mv(40, 200), mv(35, -50), mv(20, 100), mv(10, -90), mv(5, 30)], // mix
      [mv(60, -500), mv(40, 200), mv(20, 100)], // велика передоплата
      [mv(40, 200), mv(30, 100), mv(1, -80)], // FIFO part
    ];
    for (const movs of cases) {
      const res = computeOverdue(movs, 14, NOW);
      const expected = Math.round(Math.max(0, sumAmounts(movs)) * 100) / 100;
      expect(res.totalOpenEur).toBeCloseTo(expected, 2);
      // overdue ніколи не перевищує загальний борг.
      expect(res.overdueEur).toBeLessThanOrEqual(res.totalOpenEur + 0.001);
    }
  });

  it("breakdown повертає recorderHex + дати по відкритих документах", () => {
    const movs: DebtMovementLite[] = [
      { occurredAt: daysAgo(40), amountEur: 200, recorderHex: "AAA" },
      { occurredAt: daysAgo(20), amountEur: 100, recorderHex: "BBB" },
      { occurredAt: daysAgo(1), amountEur: -200 },
    ];
    const res = computeOverdue(movs, 14, NOW);
    // FIFO гасить весь AAA (200), лишається BBB 100.
    expect(res.open).toHaveLength(1);
    expect(res.open[0]?.recorderHex).toBe("BBB");
    expect(res.open[0]?.remaining).toBe(100);
    expect(res.open[0]?.days).toBe(20);
    expect(res.open[0]?.daysOverdue).toBe(6); // 20 − 14
    expect(res.oldestOpenDays).toBe(20);
  });

  it("oldestOpenDays = макс. вік серед відкритих документів", () => {
    const movs = [mv(50, 100), mv(10, 100)];
    const res = computeOverdue(movs, 14, NOW);
    expect(res.oldestOpenDays).toBe(50);
    // лише старий (50 днів) прострочений; 10-денний — ні.
    expect(res.overdueEur).toBe(100);
  });
});
