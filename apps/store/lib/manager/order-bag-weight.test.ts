import { describe, it, expect } from "vitest";
import {
  averageBagWeight,
  bagWeightForQuantity,
  DEFAULT_BAG_WEIGHT_KG,
} from "./order-bag-weight";

describe("averageBagWeight", () => {
  it("використовує Product.averageWeight коли він є й додатний", () => {
    expect(averageBagWeight({ averageWeight: 23.5 })).toBe(23.5);
  });

  it("ігнорує невалідний averageWeight (0/від'ємний/null) і йде на fallback", () => {
    expect(averageBagWeight({ averageWeight: 0 })).toBe(DEFAULT_BAG_WEIGHT_KG);
    expect(averageBagWeight({ averageWeight: -5 })).toBe(DEFAULT_BAG_WEIGHT_KG);
    expect(averageBagWeight({ averageWeight: null })).toBe(
      DEFAULT_BAG_WEIGHT_KG,
    );
  });

  it("ігнорує неправдоподібну вагу мішка (> 100 кг — вага залишку) → 20 кг", () => {
    expect(averageBagWeight({ averageWeight: 726.7 })).toBe(
      DEFAULT_BAG_WEIGHT_KG,
    );
    expect(averageBagWeight({ averageWeight: 100.01 })).toBe(
      DEFAULT_BAG_WEIGHT_KG,
    );
    // 100 кг включно — ще правдоподібно (великогабарит).
    expect(averageBagWeight({ averageWeight: 100 })).toBe(100);
  });
});

describe("bagWeightForQuantity", () => {
  it("середня вага × кількість мішків", () => {
    expect(bagWeightForQuantity({ averageWeight: 20 }, 3)).toBe(60);
    expect(bagWeightForQuantity({ averageWeight: 18.5 }, 2)).toBe(37);
  });

  it("дефолт 1 мішок коли кількість < 1 / невалідна", () => {
    expect(bagWeightForQuantity({ averageWeight: 20 }, 0)).toBe(20);
    expect(bagWeightForQuantity({ averageWeight: 20 }, -2)).toBe(20);
    expect(bagWeightForQuantity({ averageWeight: 20 }, Number.NaN)).toBe(20);
  });

  it("обрізає дробову кількість мішків до цілого", () => {
    expect(bagWeightForQuantity({ averageWeight: 20 }, 2.9)).toBe(40);
  });

  it("використовує дефолтну вагу мішка коли немає даних", () => {
    expect(bagWeightForQuantity({ averageWeight: null }, 2)).toBe(
      DEFAULT_BAG_WEIGHT_KG * 2,
    );
  });

  it("округлює суму до грамів", () => {
    expect(bagWeightForQuantity({ averageWeight: 20.3333 }, 3)).toBeCloseTo(
      61,
      3,
    );
  });
});
