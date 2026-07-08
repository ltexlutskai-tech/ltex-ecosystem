import { describe, it, expect } from "vitest";
import {
  buildCashFlowLegs,
  CASH_DESK_CODE,
  LOCAL_RECORDER_PREFIX,
  type CashFlowOrderInput,
} from "./cashflow-register";

const base: CashFlowOrderInput = {
  type: "income",
  amountUah: 0,
  amountEur: 0,
  amountUsd: 0,
  amountUahCashless: 0,
  rateEur: 43,
  rateUsd: 40,
};

describe("buildCashFlowLegs", () => {
  it("порожній ордер (усі суми 0) → без рухів", () => {
    expect(buildCashFlowLegs(base, null)).toEqual([]);
  });

  it("готівка ₴ → одна нога UAH на касі, € за курсом-знімком", () => {
    const legs = buildCashFlowLegs({ ...base, amountUah: 430 }, null);
    expect(legs).toEqual([
      {
        lineNo: 1,
        accountCode1C: CASH_DESK_CODE,
        currencyCode: "UAH",
        direction: 0,
        amountUah: 430,
        amountUpr: 10, // 430 / 43
      },
    ]);
  });

  it("безнал ₴ → нога UAH на банк-рахунку", () => {
    const legs = buildCashFlowLegs(
      { ...base, amountUahCashless: 860 },
      "acc-hex",
    );
    expect(legs).toEqual([
      {
        lineNo: 1,
        accountCode1C: "acc-hex",
        currencyCode: "UAH",
        direction: 0,
        amountUah: 860,
        amountUpr: 20,
      },
    ]);
  });

  it("готівка € → нога EUR, amountUpr = сама сума €", () => {
    const legs = buildCashFlowLegs({ ...base, amountEur: 15 }, null);
    expect(legs[0]).toMatchObject({
      accountCode1C: CASH_DESK_CODE,
      currencyCode: "EUR",
      amountUah: 15,
      amountUpr: 15,
    });
  });

  it("готівка $ → нога USD, € через USD→UAH→EUR", () => {
    const legs = buildCashFlowLegs({ ...base, amountUsd: 43 }, null);
    // 43 * 40 / 43 = 40
    expect(legs[0]).toMatchObject({
      currencyCode: "USD",
      amountUah: 43,
      amountUpr: 40,
    });
  });

  it("розхід (expense) → direction=1 на всіх ногах", () => {
    const legs = buildCashFlowLegs(
      { ...base, type: "expense", amountUah: 100 },
      null,
    );
    expect(legs.every((l) => l.direction === 1)).toBe(true);
  });

  it("кілька ніг → послідовна нумерація lineNo 1..N", () => {
    const legs = buildCashFlowLegs(
      {
        ...base,
        amountUah: 430,
        amountUahCashless: 430,
        amountEur: 5,
        amountUsd: 43,
      },
      "acc",
    );
    expect(legs.map((l) => l.lineNo)).toEqual([1, 2, 3, 4]);
    expect(legs.map((l) => l.currencyCode)).toEqual([
      "UAH",
      "UAH",
      "EUR",
      "USD",
    ]);
  });

  it("нульовий курс EUR → UAH-нога з amountUpr=0 (без ділення на 0)", () => {
    const legs = buildCashFlowLegs(
      { ...base, amountUah: 500, rateEur: 0 },
      null,
    );
    expect(legs[0]?.amountUpr).toBe(0);
  });
});

describe("константи реєстратора", () => {
  it("LOCAL_RECORDER_PREFIX має namespace 'local:'", () => {
    expect(LOCAL_RECORDER_PREFIX).toBe("local:");
    expect(`${LOCAL_RECORDER_PREFIX}abc`).toBe("local:abc");
  });
});
