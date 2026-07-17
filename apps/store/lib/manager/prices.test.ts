import { describe, it, expect } from "vitest";
import {
  BASE_PRICE_TYPE,
  SALE_PRICE_TYPE,
  buildPricesOrderBy,
  buildPricesWhere,
  deriveProductRow,
  newProductCutoff,
  type RawPriceProduct,
} from "./prices";

const NOW = new Date("2026-05-20T12:00:00Z");

describe("buildPricesWhere", () => {
  it("returns empty where коли немає фільтрів", () => {
    expect(buildPricesWhere({})).toEqual({});
  });

  it("додає OR по name + articleCode для пошуку", () => {
    const w = buildPricesWhere({ q: "футб" }) as { AND: unknown[] };
    const clause = w.AND[0] as { OR: Array<Record<string, unknown>> };
    expect(clause.OR).toHaveLength(2);
    expect(clause.OR[0]).toHaveProperty("name");
    expect(clause.OR[1]).toHaveProperty("articleCode");
  });

  it("ігнорує порожній q", () => {
    expect(buildPricesWhere({ q: "   " })).toEqual({});
  });

  it("додає categoryId", () => {
    const w = buildPricesWhere({ categoryId: "cat1" }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ categoryId: "cat1" });
  });

  it("період приходу — OR(arrivalDate, fallback createdAt)", () => {
    const w = buildPricesWhere({
      arrivalFrom: new Date("2026-05-01"),
      arrivalTo: new Date("2026-05-31"),
    }) as { AND: Array<{ lots: { some: { OR: unknown[] } } }> };
    const lotsClause = w.AND[0]?.lots.some;
    expect(lotsClause?.OR).toHaveLength(2);
  });

  it("priceFrom/priceTo фільтрує по wholesale price", () => {
    const w = buildPricesWhere({ priceFrom: 5, priceTo: 10 }) as {
      AND: Array<{
        prices: {
          some: { priceType: string; amount: { gte: number; lte: number } };
        };
      }>;
    };
    const p = w.AND[0]?.prices.some;
    expect(p?.priceType).toBe(BASE_PRICE_TYPE);
    expect(p?.amount.gte).toBe(5);
    expect(p?.amount.lte).toBe(10);
  });

  it("inStock — OR(inStock true, free lot)", () => {
    const w = buildPricesWhere({ inStock: true }) as {
      AND: Array<{ OR: unknown[] }>;
    };
    expect(w.AND[0]?.OR).toHaveLength(2);
  });

  it("target — лот isTarget", () => {
    const w = buildPricesWhere({ target: true }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ lots: { some: { isTarget: true } } });
  });

  it("onSale — наявність обох типів цін", () => {
    const w = buildPricesWhere({ onSale: true }) as {
      AND: Array<{ AND: unknown[] }>;
    };
    const inner = w.AND[0]?.AND as Array<{
      prices: { some: { priceType: string } };
    }>;
    expect(inner[0]?.prices.some.priceType).toBe(SALE_PRICE_TYPE);
    expect(inner[1]?.prices.some.priceType).toBe(BASE_PRICE_TYPE);
  });

  it("isNew — createdAt >= cutoff", () => {
    const w = buildPricesWhere({ isNew: true, now: NOW }) as {
      AND: Array<{ createdAt: { gte: Date } }>;
    };
    expect(w.AND[0]?.createdAt.gte).toEqual(newProductCutoff(NOW));
  });

  it("hasVideo — OR(product.videoUrl, lot.videoUrl)", () => {
    const w = buildPricesWhere({ hasVideo: true }) as {
      AND: Array<{ OR: unknown[] }>;
    };
    expect(w.AND[0]?.OR).toHaveLength(2);
  });

  it("noVideo — товар без відео і лотів без відео", () => {
    const w = buildPricesWhere({ noVideo: true }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ videoUrl: null });
    expect(w.AND).toContainEqual({
      NOT: { lots: { some: { videoUrl: { not: null } } } },
    });
  });

  it("комбінує кілька фільтрів у AND", () => {
    const w = buildPricesWhere({
      q: "test",
      categoryId: "c1",
      target: true,
    }) as { AND: unknown[] };
    expect(w.AND).toHaveLength(3);
  });
});

describe("buildPricesOrderBy", () => {
  it("name asc/desc", () => {
    expect(buildPricesOrderBy("name", "asc")).toEqual({ name: "asc" });
    expect(buildPricesOrderBy("name", "desc")).toEqual({ name: "desc" });
  });
  it("arrival -> createdAt", () => {
    expect(buildPricesOrderBy("arrival", "desc")).toEqual({
      createdAt: "desc",
    });
  });
});

function raw(over: Partial<RawPriceProduct> = {}): RawPriceProduct {
  return {
    id: "p1",
    articleCode: "A1",
    name: "Test",
    slug: "test",
    description: "desc",
    priceUnit: "kg",
    videoUrl: null,
    inStock: true,
    createdAt: new Date("2026-05-19T00:00:00Z"),
    category: { name: "Категорія" },
    prices: [],
    lots: [],
    ...over,
  };
}

describe("deriveProductRow", () => {
  it("сумує залишок (кг + шт) тільки вільних лотів", () => {
    const row = deriveProductRow(
      raw({
        lots: [
          {
            weight: 10,
            quantity: 3,
            status: "free",
            isTarget: false,
            videoUrl: null,
          },
          {
            weight: 5,
            quantity: 2,
            status: "free",
            isTarget: false,
            videoUrl: null,
          },
          {
            weight: 100,
            quantity: 50,
            status: "sold",
            isTarget: false,
            videoUrl: null,
          },
        ],
      }),
      NOW,
    );
    expect(row.remainingKg).toBe(15);
    expect(row.remainingUnits).toBe(5);
    expect(row.freeLotsCount).toBe(2);
  });

  it("базова + акційна (коли нижча)", () => {
    const row = deriveProductRow(
      raw({
        prices: [
          { priceType: BASE_PRICE_TYPE, amount: 10, currency: "EUR" },
          { priceType: SALE_PRICE_TYPE, amount: 8, currency: "EUR" },
        ],
      }),
      NOW,
    );
    expect(row.basePrice).toBe(10);
    expect(row.salePrice).toBe(8);
  });

  it("акційна ігнорується якщо не нижча за базову", () => {
    const row = deriveProductRow(
      raw({
        prices: [
          { priceType: BASE_PRICE_TYPE, amount: 10, currency: "EUR" },
          { priceType: SALE_PRICE_TYPE, amount: 12, currency: "EUR" },
        ],
      }),
      NOW,
    );
    expect(row.salePrice).toBeNull();
  });

  it("isTarget якщо будь-який лот цільовий", () => {
    const row = deriveProductRow(
      raw({
        lots: [
          {
            weight: 1,
            quantity: 1,
            status: "free",
            isTarget: true,
            videoUrl: null,
          },
        ],
      }),
      NOW,
    );
    expect(row.isTarget).toBe(true);
  });

  it("hasVideo з відео товара АБО лота", () => {
    expect(deriveProductRow(raw({ videoUrl: "u" }), NOW).hasVideo).toBe(true);
    expect(
      deriveProductRow(
        raw({
          lots: [
            {
              weight: 1,
              quantity: 1,
              status: "free",
              isTarget: false,
              videoUrl: "u",
            },
          ],
        }),
        NOW,
      ).hasVideo,
    ).toBe(true);
    expect(deriveProductRow(raw(), NOW).hasVideo).toBe(false);
  });

  it("isNew у межах 14 днів", () => {
    expect(
      deriveProductRow(raw({ createdAt: new Date("2026-05-19") }), NOW).isNew,
    ).toBe(true);
    expect(
      deriveProductRow(raw({ createdAt: new Date("2026-04-01") }), NOW).isNew,
    ).toBe(false);
  });

  it("categoryName з relation або null", () => {
    expect(deriveProductRow(raw(), NOW).categoryName).toBe("Категорія");
    expect(
      deriveProductRow(raw({ category: null }), NOW).categoryName,
    ).toBeNull();
  });
});
