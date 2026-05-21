import { describe, it, expect } from "vitest";
import { PRICE_STEP, roundToStep, stepUp, stepDown } from "./price-step";

describe("price-step", () => {
  it("PRICE_STEP = 0.05", () => {
    expect(PRICE_STEP).toBe(0.05);
  });

  describe("roundToStep", () => {
    it("округлює до найближчого кратного 0.05", () => {
      expect(roundToStep(1.23)).toBe(1.25);
      expect(roundToStep(1.21)).toBe(1.2);
      expect(roundToStep(2.0)).toBe(2.0);
      expect(roundToStep(0.07)).toBe(0.05);
      expect(roundToStep(0.08)).toBe(0.1);
    });

    it("затискає від'ємні / невалідні у 0", () => {
      expect(roundToStep(-5)).toBe(0);
      expect(roundToStep(Number.NaN)).toBe(0);
      expect(roundToStep(0)).toBe(0);
    });

    it("без float-шуму", () => {
      expect(roundToStep(0.3)).toBe(0.3);
      expect(roundToStep(0.35)).toBe(0.35);
    });
  });

  describe("stepUp / stepDown", () => {
    it("stepUp додає 0.05", () => {
      expect(stepUp(1.2)).toBe(1.25);
      expect(stepUp(1.23)).toBe(1.3); // спершу round до 1.25, потім +0.05
      expect(stepUp(0)).toBe(0.05);
    });

    it("stepDown віднімає 0.05, не нижче 0", () => {
      expect(stepDown(1.25)).toBe(1.2);
      expect(stepDown(0.05)).toBe(0);
      expect(stepDown(0)).toBe(0);
      expect(stepDown(0.03)).toBe(0); // round до 0.05, потім -0.05 → 0
    });
  });
});
