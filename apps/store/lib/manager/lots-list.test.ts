import { describe, it, expect } from "vitest";
import {
  buildLotsOrderBy,
  buildLotsWhere,
  groupLotsByProduct,
  serializeLotRow,
  type LotListItem,
  type RawLotRow,
} from "./lots-list";

describe("buildLotsWhere", () => {
  it("за замовчуванням фільтрує лише лоти із залишком (weight > 0)", () => {
    const w = buildLotsWhere({}) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ weight: { gt: 0 } });
  });

  it("onlyInStock=false вимикає базовий фільтр залишку", () => {
    expect(buildLotsWhere({ onlyInStock: false })).toEqual({});
  });

  it("onlyInStock=true лишає базовий фільтр залишку", () => {
    const w = buildLotsWhere({ onlyInStock: true }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ weight: { gt: 0 } });
    expect(w.AND).toHaveLength(1);
  });

  it("пошук додає OR по barcode + product.name + product.articleCode", () => {
    const w = buildLotsWhere({ q: "111" }) as {
      AND: Array<{ OR?: Array<Record<string, unknown>> }>;
    };
    const orClause = w.AND.find((c) => c.OR)?.OR;
    expect(orClause).toHaveLength(3);
    expect(orClause?.[0]).toHaveProperty("barcode");
    expect(orClause?.[1]).toHaveProperty("product");
    expect(orClause?.[2]).toHaveProperty("product");
  });

  it("ігнорує порожній q (лише базовий фільтр)", () => {
    const w = buildLotsWhere({ q: "   " }) as { AND: unknown[] };
    expect(w.AND).toEqual([{ weight: { gt: 0 } }]);
  });

  it("productId фільтрує по конкретному товару", () => {
    const w = buildLotsWhere({ productId: "p1" }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ productId: "p1" });
  });

  it("target додає isTarget=true", () => {
    const w = buildLotsWhere({ target: true }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ isTarget: true });
  });

  it("target=false не додає фільтр isTarget", () => {
    const w = buildLotsWhere({ target: false }) as { AND: unknown[] };
    expect(w.AND).not.toContainEqual({ isTarget: true });
  });

  it("hasVideo додає videoUrl != null", () => {
    const w = buildLotsWhere({ hasVideo: true }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ videoUrl: { not: null } });
  });

  it("статус free → status=free", () => {
    const w = buildLotsWhere({ status: "free" }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ status: "free" });
  });

  it("статус reserved → status=reserved", () => {
    const w = buildLotsWhere({ status: "reserved" }) as { AND: unknown[] };
    expect(w.AND).toContainEqual({ status: "reserved" });
  });

  it("статус all не додає фільтр статусу", () => {
    const w = buildLotsWhere({ status: "all" }) as { AND: unknown[] };
    expect(w.AND).not.toContainEqual({ status: "free" });
    expect(w.AND).not.toContainEqual({ status: "reserved" });
    expect(w.AND).toEqual([{ weight: { gt: 0 } }]);
  });

  it("комбінує кілька фільтрів у AND", () => {
    const w = buildLotsWhere({
      q: "куртк",
      productId: "p1",
      target: true,
      hasVideo: true,
      status: "free",
    }) as { AND: unknown[] };
    // weight + q + productId + target + hasVideo + status === 6
    expect(w.AND).toHaveLength(6);
  });
});

describe("buildLotsOrderBy", () => {
  it("product (default) сортує за артикулом → назвою → вагою", () => {
    const o = buildLotsOrderBy("product", "asc");
    expect(o).toEqual([
      { product: { articleCode: "asc" } },
      { product: { name: "asc" } },
      { weight: "desc" },
    ]);
  });

  it("product desc застосовує напрям до артикула + назви", () => {
    const o = buildLotsOrderBy("product", "desc");
    expect(o[0]).toEqual({ product: { articleCode: "desc" } });
    expect(o[1]).toEqual({ product: { name: "desc" } });
  });

  it("arrival сортує за createdAt + стабільний id", () => {
    expect(buildLotsOrderBy("arrival", "desc")).toEqual([
      { createdAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("weight сортує за вагою + стабільний id", () => {
    expect(buildLotsOrderBy("weight", "asc")).toEqual([
      { weight: "asc" },
      { id: "asc" },
    ]);
  });
});

function rawLot(over: Partial<RawLotRow> = {}): RawLotRow {
  return {
    id: "lot1",
    barcode: "1234567890123",
    weight: 25,
    quantity: 1,
    status: "free",
    sector: "A-1",
    videoUrl: null,
    videoDate: null,
    isTarget: false,
    isOpen: false,
    product: {
      id: "p1",
      articleCode: "A1",
      name: "Куртки зимові",
      slug: "kurtky-zymovi",
    },
    ...over,
  };
}

describe("serializeLotRow", () => {
  it("перетворює raw-лот у плаский рядок", () => {
    const row = serializeLotRow(rawLot());
    expect(row.id).toBe("lot1");
    expect(row.barcode).toBe("1234567890123");
    expect(row.weight).toBe(25);
    expect(row.product.name).toBe("Куртки зимові");
    expect(row.videoDateIso).toBeNull();
  });

  it("isReserved=true коли status=reserved", () => {
    expect(serializeLotRow(rawLot({ status: "reserved" })).isReserved).toBe(
      true,
    );
    expect(serializeLotRow(rawLot({ status: "free" })).isReserved).toBe(false);
  });

  it("hasVideo=true коли є videoUrl", () => {
    expect(serializeLotRow(rawLot({ videoUrl: "u" })).hasVideo).toBe(true);
    expect(serializeLotRow(rawLot({ videoUrl: null })).hasVideo).toBe(false);
  });

  it("videoDate серіалізується у ISO", () => {
    const d = new Date("2026-05-10T00:00:00Z");
    expect(serializeLotRow(rawLot({ videoDate: d })).videoDateIso).toBe(
      d.toISOString(),
    );
  });
});

function item(
  productId: string,
  lotId: string,
  over: Partial<LotListItem> = {},
): LotListItem {
  return {
    id: lotId,
    barcode: `bc-${lotId}`,
    weight: 10,
    quantity: 1,
    status: "free",
    sector: null,
    videoUrl: null,
    videoDateIso: null,
    isTarget: false,
    isOpen: false,
    isReserved: false,
    hasVideo: false,
    product: {
      id: productId,
      articleCode: `art-${productId}`,
      name: `Товар ${productId}`,
      slug: `slug-${productId}`,
    },
    ...over,
  };
}

describe("groupLotsByProduct", () => {
  it("групує лоти за товаром, зберігаючи порядок першої появи", () => {
    const groups = groupLotsByProduct([
      item("p1", "l1"),
      item("p1", "l2"),
      item("p2", "l3"),
      item("p1", "l4"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.productId).toBe("p1");
    expect(groups[0]?.lots.map((l) => l.id)).toEqual(["l1", "l2", "l4"]);
    expect(groups[1]?.productId).toBe("p2");
    expect(groups[1]?.lots.map((l) => l.id)).toEqual(["l3"]);
  });

  it("копіює метадані товару у групу", () => {
    const groups = groupLotsByProduct([item("p1", "l1")]);
    expect(groups[0]?.articleCode).toBe("art-p1");
    expect(groups[0]?.productName).toBe("Товар p1");
    expect(groups[0]?.productSlug).toBe("slug-p1");
  });

  it("порожній вхід → порожній список груп", () => {
    expect(groupLotsByProduct([])).toEqual([]);
  });
});
