import { describe, it, expect } from "vitest";
import {
  computeMileage,
  computeMileageExpenseAmount,
} from "./route-sheet-expenses";

describe("route-sheet-expenses — computeMileage", () => {
  it("кінець − початок коли обидва задані й кінець ≥ початок", () => {
    expect(computeMileage(1000, 1250)).toBe(250);
  });

  it("0 коли початок відсутній", () => {
    expect(computeMileage(null, 1250)).toBe(0);
  });

  it("0 коли кінець відсутній", () => {
    expect(computeMileage(1000, null)).toBe(0);
  });

  it("0 коли кінець менший за початок (некоректний ввід)", () => {
    expect(computeMileage(1250, 1000)).toBe(0);
  });

  it("округлює до 2 знаків", () => {
    expect(computeMileage(1000, 1250.555)).toBe(250.56);
  });

  it("0 коли обидва null", () => {
    expect(computeMileage(null, null)).toBe(0);
  });
});

describe("route-sheet-expenses — computeMileageExpenseAmount", () => {
  it("пробіг × ціна за км", () => {
    expect(computeMileageExpenseAmount(1000, 1250, 12)).toBe(3000);
  });

  it("0 коли ціни немає", () => {
    expect(computeMileageExpenseAmount(1000, 1250, null)).toBe(0);
  });

  it("0 коли ціна ≤ 0", () => {
    expect(computeMileageExpenseAmount(1000, 1250, 0)).toBe(0);
  });

  it("0 коли пробіг 0 (неповний кілометраж)", () => {
    expect(computeMileageExpenseAmount(null, 1250, 12)).toBe(0);
  });

  it("округлює до 2 знаків", () => {
    expect(computeMileageExpenseAmount(1000, 1100.5, 3.33)).toBe(334.67);
  });
});
