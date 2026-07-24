import { describe, it, expect } from "vitest";
import { computeCashBalances, computeDiffs } from "./cash-count";

describe("computeCashBalances", () => {
  it("прихід − розхід по кожній валюті", () => {
    const out = computeCashBalances([
      { currencyCode: "UAH", direction: 0, total: 50000 },
      { currencyCode: "UAH", direction: 1, total: 1790 },
      { currencyCode: "EUR", direction: 0, total: 2300 },
      { currencyCode: "USD", direction: 0, total: 980 },
    ]);
    expect(out).toEqual({ UAH: 48210, EUR: 2300, USD: 980 });
  });

  it("null-валюта рахується як UAH; невідомі валюти ігноруються", () => {
    const out = computeCashBalances([
      { currencyCode: null, direction: 0, total: 100 },
      { currencyCode: "PLN", direction: 0, total: 999 },
    ]);
    expect(out).toEqual({ UAH: 100, EUR: 0, USD: 0 });
  });

  it("порожній ввід → нулі, float-шум округлюється", () => {
    expect(computeCashBalances([])).toEqual({ UAH: 0, EUR: 0, USD: 0 });
    const out = computeCashBalances([
      { currencyCode: "UAH", direction: 0, total: 0.1 },
      { currencyCode: "UAH", direction: 0, total: 0.2 },
    ]);
    expect(out.UAH).toBe(0.3);
  });
});

describe("computeDiffs", () => {
  it("факт − облік: недостача відʼємна, надлишок додатний", () => {
    const diffs = computeDiffs(
      { UAH: 48210, EUR: 2300, USD: 980 },
      { UAH: 48210, EUR: 2250, USD: 1000 },
    );
    expect(diffs).toEqual([
      { currency: "UAH", expected: 48210, actual: 48210, diff: 0 },
      { currency: "EUR", expected: 2300, actual: 2250, diff: -50 },
      { currency: "USD", expected: 980, actual: 1000, diff: 20 },
    ]);
  });
});
