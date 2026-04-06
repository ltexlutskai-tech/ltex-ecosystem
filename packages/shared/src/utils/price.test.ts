import { describe, it, expect } from "vitest";
import { formatPrice, convertCurrency } from "./price";

describe("formatPrice", () => {
  it("formats EUR with symbol prefix", () => {
    expect(formatPrice(10, "EUR")).toBe("€10.00");
  });

  it("formats USD with symbol prefix", () => {
    expect(formatPrice(25.5, "USD")).toBe("$25.50");
  });

  it("formats UAH with symbol suffix", () => {
    expect(formatPrice(100, "UAH")).toBe("100.00 ₴");
  });

  it("formats zero", () => {
    expect(formatPrice(0, "EUR")).toBe("€0.00");
  });

  it("rounds to 2 decimal places", () => {
    expect(formatPrice(10.999, "EUR")).toBe("€11.00");
    expect(formatPrice(10.001, "EUR")).toBe("€10.00");
  });

  it("handles large numbers", () => {
    expect(formatPrice(99999.99, "UAH")).toBe("99999.99 ₴");
  });
});

describe("convertCurrency", () => {
  it("returns same amount when currencies match", () => {
    expect(convertCurrency(100, "EUR", "EUR", 42)).toBe(100);
  });

  it("converts EUR to UAH", () => {
    expect(convertCurrency(10, "EUR", "UAH", 42.5)).toBe(425);
  });

  it("rounds to 2 decimal places", () => {
    expect(convertCurrency(10, "EUR", "UAH", 42.333)).toBe(423.33);
  });

  it("handles zero amount", () => {
    expect(convertCurrency(0, "EUR", "UAH", 42)).toBe(0);
  });

  it("handles fractional rates", () => {
    expect(convertCurrency(100, "UAH", "EUR", 0.0235)).toBe(2.35);
  });
});
