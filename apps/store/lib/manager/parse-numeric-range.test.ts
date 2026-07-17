import { describe, it, expect } from "vitest";
import { parseNumericRange } from "./parse-numeric-range";

describe("parseNumericRange", () => {
  it("одне число → min == max", () => {
    expect(parseNumericRange("40")).toEqual({ min: 40, max: 40 });
  });
  it("діапазон через дефіс/тире", () => {
    expect(parseNumericRange("40-50")).toEqual({ min: 40, max: 50 });
    expect(parseNumericRange("40–50 шт")).toEqual({ min: 40, max: 50 });
  });
  it("десяткові з комою/крапкою", () => {
    expect(parseNumericRange("0,3")).toEqual({ min: 0.3, max: 0.3 });
    expect(parseNumericRange("0.3–0.5")).toEqual({ min: 0.3, max: 0.5 });
  });
  it("порядок чисел не важливий (беремо min/max)", () => {
    expect(parseNumericRange("50-40")).toEqual({ min: 40, max: 50 });
  });
  it("без чисел / порожньо → null", () => {
    expect(parseNumericRange("багато")).toBeNull();
    expect(parseNumericRange("")).toBeNull();
    expect(parseNumericRange(null)).toBeNull();
  });
});
