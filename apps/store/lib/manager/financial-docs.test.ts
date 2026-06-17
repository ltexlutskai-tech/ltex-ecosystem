import { describe, it, expect } from "vitest";
import {
  docStatusLabel,
  docStatusClass,
  paymentMethodLabel,
  fmtAmount,
  fmtEur,
  formatDocNo,
} from "./financial-docs";

describe("financial-docs helpers", () => {
  it("docStatusLabel мапить відомі статуси, fallback на сире", () => {
    expect(docStatusLabel("draft")).toBe("Чернетка");
    expect(docStatusLabel("posted")).toBe("Проведено");
    expect(docStatusLabel("cancelled")).toBe("Скасовано");
    expect(docStatusLabel("weird")).toBe("weird");
  });

  it("docStatusClass завжди повертає клас (fallback gray)", () => {
    expect(docStatusClass("posted")).toContain("emerald");
    expect(docStatusClass("unknown")).toContain("gray");
  });

  it("paymentMethodLabel: null → «—», мапить cash/card/bank", () => {
    expect(paymentMethodLabel(null)).toBe("—");
    expect(paymentMethodLabel("cash")).toBe("Готівка");
    expect(paymentMethodLabel("card")).toBe("Картка");
    expect(paymentMethodLabel("bank")).toBe("Банк (безнал)");
  });

  it("fmtAmount додає валюту і 2 знаки", () => {
    expect(fmtAmount(1500, "UAH")).toContain("UAH");
    expect(fmtAmount(1500, "UAH")).toMatch(/1[\s ]?500,00/);
  });

  it("fmtEur форматує з символом євро", () => {
    expect(fmtEur(99.5)).toContain("€");
    expect(fmtEur(99.5)).toContain("99,50");
  });

  it("formatDocNo: number1C пріоритетний, інакше №docNumber", () => {
    expect(formatDocNo("L0000123", 42)).toBe("L0000123");
    expect(formatDocNo(null, 42)).toBe("№42");
    expect(formatDocNo("  ", 7)).toBe("№7");
  });
});
