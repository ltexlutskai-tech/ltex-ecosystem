import { describe, it, expect } from "vitest";
import {
  isSupplierPriceType,
  priceTypeLabel,
  classifyPrices,
  basePriceOf,
  computeLotStats,
  buildKeyFacts,
  formatRemainingDisplay,
  type RawPrice,
} from "./product-card";
import { BASE_PRICE_TYPE, SALE_PRICE_TYPE } from "./prices";

function price(
  priceType: string,
  amount: number,
  validFrom = "2026-01-01",
  currency = "EUR",
): RawPrice {
  return { priceType, amount, currency, validFrom: new Date(validFrom) };
}

describe("isSupplierPriceType", () => {
  it("матчить префікси постачальника", () => {
    expect(isSupplierPriceType("supplier")).toBe(true);
    expect(isSupplierPriceType("supplier_eur")).toBe(true);
    expect(isSupplierPriceType("purchase")).toBe(true);
    expect(isSupplierPriceType("закупівельна")).toBe(true);
    expect(isSupplierPriceType("постачальник")).toBe(true);
  });

  it("ігнорує регістр і пробіли", () => {
    expect(isSupplierPriceType("  SUPPLIER  ")).toBe(true);
  });

  it("не матчить продажні типи", () => {
    expect(isSupplierPriceType(BASE_PRICE_TYPE)).toBe(false);
    expect(isSupplierPriceType(SALE_PRICE_TYPE)).toBe(false);
    expect(isSupplierPriceType("retail")).toBe(false);
  });
});

describe("priceTypeLabel", () => {
  it("дає людські назви для базової та акційної", () => {
    expect(priceTypeLabel(BASE_PRICE_TYPE)).toBe("Опт (базова)");
    expect(priceTypeLabel(SALE_PRICE_TYPE)).toBe("Акційна");
  });

  it("повертає сирий код для невідомих типів", () => {
    expect(priceTypeLabel("custom_type")).toBe("custom_type");
  });
});

describe("classifyPrices", () => {
  it("ділить на sale + supplier", () => {
    const result = classifyPrices([
      price(BASE_PRICE_TYPE, 5),
      price(SALE_PRICE_TYPE, 4),
      price("supplier", 3),
    ]);
    expect(result.sale.map((l) => l.priceType)).toEqual([
      BASE_PRICE_TYPE,
      SALE_PRICE_TYPE,
    ]);
    expect(result.supplier.map((l) => l.priceType)).toEqual(["supplier"]);
  });

  it("лишає найновіший запис на кожен priceType", () => {
    const result = classifyPrices([
      price(BASE_PRICE_TYPE, 5, "2026-01-01"),
      price(BASE_PRICE_TYPE, 8, "2026-05-01"),
    ]);
    expect(result.sale).toHaveLength(1);
    expect(result.sale[0]?.amount).toBe(8);
  });

  it("сортує базова → акційна → решта", () => {
    const result = classifyPrices([
      price("zzz_other", 1),
      price(SALE_PRICE_TYPE, 4),
      price(BASE_PRICE_TYPE, 5),
    ]);
    expect(result.sale.map((l) => l.priceType)).toEqual([
      BASE_PRICE_TYPE,
      SALE_PRICE_TYPE,
      "zzz_other",
    ]);
  });

  it("порожній масив дає порожні блоки", () => {
    expect(classifyPrices([])).toEqual({ sale: [], supplier: [] });
  });
});

describe("basePriceOf", () => {
  it("повертає wholesale рядок", () => {
    const base = basePriceOf([price(BASE_PRICE_TYPE, 5), price("supplier", 3)]);
    expect(base?.amount).toBe(5);
    expect(base?.priceType).toBe(BASE_PRICE_TYPE);
  });

  it("null коли немає wholesale", () => {
    expect(basePriceOf([price(SALE_PRICE_TYPE, 4)])).toBeNull();
  });
});

describe("computeLotStats", () => {
  it("рахує вільні з залишком, з відео та зарезервовані", () => {
    const stats = computeLotStats([
      { weight: 25, status: "free", videoUrl: "u1" },
      { weight: 20, status: "free", videoUrl: null },
      { weight: 0, status: "free", videoUrl: "u2" }, // no remainder → не рахуємо
      { weight: 30, status: "reserved", videoUrl: "u3" },
      { weight: 15, status: "sold", videoUrl: null },
    ]);
    expect(stats.availableCount).toBe(2);
    expect(stats.withVideoCount).toBe(1);
    expect(stats.reservedCount).toBe(1);
    expect(stats.remainingKg).toBe(45);
  });

  it("порожній список дає нулі", () => {
    expect(computeLotStats([])).toEqual({
      availableCount: 0,
      withVideoCount: 0,
      reservedCount: 0,
      remainingKg: 0,
    });
  });
});

describe("buildKeyFacts", () => {
  it("показує тільки заповнені поля у фіксованому порядку", () => {
    const facts = buildKeyFacts({
      gender: "Жіноча",
      sizes: "S-XL",
      unitsPerKg: null,
      unitWeight: "",
      quality: "extra",
      season: "summer",
      country: "germany",
    });
    const labels = facts.map((f) => f.label);
    expect(labels).toEqual(["Стать", "Розміри", "Сорт", "Сезон", "Країна"]);
  });

  it("мапить довідникові коди на лейбли", () => {
    const facts = buildKeyFacts({
      gender: null,
      sizes: null,
      unitsPerKg: null,
      unitWeight: null,
      quality: "extra",
      season: "",
      country: "",
    });
    const sort = facts.find((f) => f.label === "Сорт");
    // QUALITY_LABELS["extra"] != "extra" (має укр. назву)
    expect(sort?.value).not.toBe("extra");
  });

  it("повертає сирий код коли немає лейбла", () => {
    const facts = buildKeyFacts({
      gender: null,
      sizes: null,
      unitsPerKg: null,
      unitWeight: null,
      quality: "невідомий_сорт",
      season: "",
      country: "",
    });
    expect(facts.find((f) => f.label === "Сорт")?.value).toBe("невідомий_сорт");
  });

  it("порожній товар дає порожній список", () => {
    expect(
      buildKeyFacts({
        gender: null,
        sizes: null,
        unitsPerKg: null,
        unitWeight: null,
        quality: "",
        season: "",
        country: "",
      }),
    ).toEqual([]);
  });
});

describe("formatRemainingDisplay", () => {
  const base = {
    remainingKg: 100,
    freeLotsCount: 4,
    unitsPerKg: 5,
    showAsPieces: false,
  };

  it("ваговий товар у кг (toggle off)", () => {
    expect(formatRemainingDisplay({ ...base, priceUnit: "kg" })).toBe("100 кг");
  });

  it("ваговий товар у штуках через unitsPerKg (toggle on)", () => {
    expect(
      formatRemainingDisplay({ ...base, priceUnit: "kg", showAsPieces: true }),
    ).toBe("≈ 500 шт");
  });

  it("toggle on без коефіцієнта → —", () => {
    expect(
      formatRemainingDisplay({
        ...base,
        priceUnit: "kg",
        unitsPerKg: null,
        showAsPieces: true,
      }),
    ).toBe("—");
  });

  it("штучний товар завжди у лотах", () => {
    expect(formatRemainingDisplay({ ...base, priceUnit: "piece" })).toBe(
      "4 лот.",
    );
    expect(
      formatRemainingDisplay({
        ...base,
        priceUnit: "piece",
        showAsPieces: true,
      }),
    ).toBe("4 лот.");
  });
});
