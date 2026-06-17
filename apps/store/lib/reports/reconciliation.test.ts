import { describe, it, expect } from "vitest";
import {
  computeReconciliation,
  type ReconMovementLite,
} from "./reconciliation";

function mv(iso: string, amount: number, kind = "sale"): ReconMovementLite {
  return {
    id: `m-${iso}-${amount}`,
    occurredAt: new Date(iso),
    amountEur: amount,
    kind,
    kindLabel: kind,
    sourceLabel: "тест",
    note: "—",
  };
}

describe("computeReconciliation", () => {
  it("порожній період → нульовий акт", () => {
    const r = computeReconciliation([], []);
    expect(r.openingBalanceEur).toBe(0);
    expect(r.closingBalanceEur).toBe(0);
    expect(r.totalDebitEur).toBe(0);
    expect(r.totalCreditEur).toBe(0);
    expect(r.rows).toHaveLength(0);
  });

  it("сальдо на початок = Σ рухів ДО періоду", () => {
    const prior = [mv("2026-01-01", 100), mv("2026-02-01", -30)];
    const r = computeReconciliation(prior, []);
    expect(r.openingBalanceEur).toBe(70);
    expect(r.closingBalanceEur).toBe(70);
  });

  it("дебет = реалізації, кредит = оплати у межах періоду", () => {
    const period = [
      mv("2026-03-01", 200, "sale"),
      mv("2026-03-05", -50, "payment"),
    ];
    const r = computeReconciliation([], period);
    expect(r.totalDebitEur).toBe(200);
    expect(r.totalCreditEur).toBe(50);
    expect(r.closingBalanceEur).toBe(150);
  });

  it("сальдо на кінець = початок + дебет − кредит", () => {
    const prior = [mv("2026-01-01", 100)];
    const period = [
      mv("2026-03-01", 80, "sale"),
      mv("2026-03-10", -120, "payment"),
    ];
    const r = computeReconciliation(prior, period);
    expect(r.openingBalanceEur).toBe(100);
    expect(r.totalDebitEur).toBe(80);
    expect(r.totalCreditEur).toBe(120);
    expect(r.closingBalanceEur).toBe(60);
  });

  it("наростаюче сальдо у рядках відображає рух за рухом", () => {
    const prior = [mv("2026-01-01", 50)];
    const period = [
      mv("2026-03-01", 100, "sale"),
      mv("2026-03-02", -40, "payment"),
    ];
    const r = computeReconciliation(prior, period);
    expect(r.rows[0]!.runningBalanceEur).toBe(150); // 50 + 100
    expect(r.rows[1]!.runningBalanceEur).toBe(110); // 150 − 40
  });

  it("рядки сортуються за датою (оборонне сортування)", () => {
    const period = [mv("2026-03-10", 10, "sale"), mv("2026-03-01", 20, "sale")];
    const r = computeReconciliation([], period);
    expect(r.rows.map((x) => x.occurredAt)).toEqual([
      new Date("2026-03-01").toISOString(),
      new Date("2026-03-10").toISOString(),
    ]);
    // наростаюче сальдо рахується вже у відсортованому порядку
    expect(r.rows[0]!.runningBalanceEur).toBe(20);
    expect(r.rows[1]!.runningBalanceEur).toBe(30);
  });

  it("кожен рух у дебет АБО кредит, не в обидва", () => {
    const period = [mv("2026-03-01", 100, "sale"), mv("2026-03-02", -100)];
    const r = computeReconciliation([], period);
    expect(r.rows[0]).toMatchObject({ debitEur: 100, creditEur: 0 });
    expect(r.rows[1]).toMatchObject({ debitEur: 0, creditEur: 100 });
  });

  it("копійки округлюються до 2 знаків", () => {
    const period = [mv("2026-03-01", 10.005), mv("2026-03-02", 0.001)];
    const r = computeReconciliation([], period);
    expect(r.totalDebitEur).toBe(10.01);
  });

  it("переплата клієнта → від'ємне сальдо на кінець", () => {
    const period = [mv("2026-03-01", -200, "payment")];
    const r = computeReconciliation([], period);
    expect(r.closingBalanceEur).toBe(-200);
  });
});
