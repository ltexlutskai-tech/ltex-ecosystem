import { describe, it, expect } from "vitest";
import {
  RATE_CURRENCIES,
  isRateCurrency,
  buildRatesWhere,
  mapRateToRow,
  type RateRaw,
} from "./rates-register-view";

describe("rates-register-view", () => {
  describe("isRateCurrency", () => {
    it("приймає EUR/USD, відхиляє решту", () => {
      expect(isRateCurrency("EUR")).toBe(true);
      expect(isRateCurrency("USD")).toBe(true);
      expect(isRateCurrency("UAH")).toBe(false);
      expect(isRateCurrency("")).toBe(false);
      expect(RATE_CURRENCIES).toEqual(["EUR", "USD"]);
    });
  });

  describe("buildRatesWhere", () => {
    it("завжди обмежує currencyTo = UAH", () => {
      const where = buildRatesWhere({});
      expect(where.currencyTo).toBe("UAH");
      expect(where.date).toBeUndefined();
      expect(where.currencyFrom).toBeUndefined();
    });

    it("додає період gte/lte (lte — кінець дня)", () => {
      const where = buildRatesWhere({ from: "2024-01-01", to: "2024-01-31" });
      const date = where.date as { gte?: Date; lte?: Date };
      expect(date.gte).toEqual(new Date("2024-01-01"));
      // кінець дня 31-го
      expect(date.lte?.getHours()).toBe(23);
      expect(date.lte?.getMinutes()).toBe(59);
    });

    it("ігнорує невалідну дату та невідому валюту", () => {
      const where = buildRatesWhere({ from: "not-a-date", currency: "GBP" });
      expect(where.date).toBeUndefined();
      expect(where.currencyFrom).toBeUndefined();
    });

    it("фільтрує по валюті EUR", () => {
      const where = buildRatesWhere({ currency: "EUR" });
      expect(where.currencyFrom).toBe("EUR");
    });
  });

  describe("mapRateToRow", () => {
    it("серіалізує запис у рядок з кратністю 1", () => {
      const raw: RateRaw = {
        id: "r1",
        currencyFrom: "EUR",
        currencyTo: "UAH",
        rate: 43.1234,
        date: new Date("2024-06-15T00:00:00.000Z"),
      };
      const row = mapRateToRow(raw);
      expect(row).toEqual({
        id: "r1",
        date: "2024-06-15T00:00:00.000Z",
        currency: "EUR",
        rate: 43.1234,
        multiplier: 1,
      });
    });
  });
});
