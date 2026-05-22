import { describe, it, expect } from "vitest";
import {
  draftToWire,
  lineTotalEur,
  parseNumericInput,
  repeatPriceForProduct,
  sanitizeNumericText,
  type SaleItemDraft,
} from "./sale-types";

function draft(over: Partial<SaleItemDraft> = {}): SaleItemDraft {
  return {
    uid: "u1",
    product: {
      id: "p1",
      code1C: null,
      articleCode: null,
      name: "Test",
      slug: "test",
      priceUnit: "kg",
      averageWeight: 20,
      inStock: true,
      prices: [],
    },
    lotId: null,
    barcode: null,
    quantity: 1,
    weight: 10,
    pricePerKg: 4,
    priceEur: 40,
    ...over,
  };
}

describe("lineTotalEur", () => {
  it("= ціна/кг × вага × мішки (округлення до копійок)", () => {
    expect(lineTotalEur(2.5, 25, 1)).toBe(62.5);
    expect(lineTotalEur(2, 10, 3)).toBe(60);
  });

  it("округлює до копійок", () => {
    expect(lineTotalEur(2.333, 10, 1)).toBe(23.33);
  });
});

describe("draftToWire", () => {
  it("повертає null для рядка без товару", () => {
    expect(draftToWire(draft({ product: null }))).toBeNull();
  });

  it("зберігає lotId + barcode (скан ШК) — на відміну від замовлення", () => {
    const wire = draftToWire(
      draft({ lotId: "lot9", barcode: "B9", quantity: 2, weight: 20 }),
    );
    expect(wire).not.toBeNull();
    expect(wire?.lotId).toBe("lot9");
    expect(wire?.barcode).toBe("B9");
    expect(wire?.pricePerKg).toBe(4);
    expect(wire?.quantity).toBe(2);
    expect(wire?.weight).toBe(20);
    expect(wire?.priceEur).toBe(40);
  });

  it("загальна позиція — lotId/barcode null", () => {
    const wire = draftToWire(draft());
    expect(wire?.lotId).toBeNull();
    expect(wire?.barcode).toBeNull();
  });
});

describe("repeatPriceForProduct (Fix 4 / 1С ПовторитьЦену)", () => {
  function row(
    uid: string,
    productId: string,
    pricePerKg: number,
    weight = 10,
    quantity = 1,
  ): SaleItemDraft {
    return draft({
      uid,
      product: {
        id: productId,
        code1C: null,
        articleCode: null,
        name: productId,
        slug: productId,
        priceUnit: "kg",
        averageWeight: 20,
        inStock: true,
        prices: [],
      },
      pricePerKg,
      weight,
      quantity,
      priceEur: lineTotalEur(pricePerKg, weight, quantity),
    });
  }

  it("копіює ціну джерела на всі рядки того самого товару + перераховує суму", () => {
    const items = [
      row("a", "p1", 5, 10, 1), // джерело: 5 €/кг
      row("b", "p1", 3, 20, 2), // інший лот того ж товару
      row("c", "p2", 7, 10, 1), // інший товар — не чіпаємо
    ];
    const next = repeatPriceForProduct(items, "a");
    expect(next[0]?.pricePerKg).toBe(5); // джерело без змін
    expect(next[1]?.pricePerKg).toBe(5); // скопійовано
    expect(next[1]?.priceEur).toBe(lineTotalEur(5, 20, 2)); // 5×20×2 = 200
    expect(next[2]?.pricePerKg).toBe(7); // інший товар незмінний
  });

  it("повертає вхід без змін коли uid не знайдено", () => {
    const items = [row("a", "p1", 5)];
    expect(repeatPriceForProduct(items, "missing")).toBe(items);
  });

  it("пропускає рядки без товару", () => {
    const items = [row("a", "p1", 5), draft({ uid: "empty", product: null })];
    const next = repeatPriceForProduct(items, "a");
    expect(next[1]?.product).toBeNull();
  });
});

describe("parseNumericInput (Fix 5)", () => {
  it("парсить крапку і кому як роздільник", () => {
    expect(parseNumericInput("7.5")).toBe(7.5);
    expect(parseNumericInput("7,5")).toBe(7.5);
  });

  it("порожнє / частковий ввід → 0", () => {
    expect(parseNumericInput("")).toBe(0);
    expect(parseNumericInput(".")).toBe(0);
    expect(parseNumericInput("-")).toBe(0);
  });

  it("від'ємні та нечислові → 0", () => {
    expect(parseNumericInput("-3")).toBe(0);
    expect(parseNumericInput("abc")).toBe(0);
  });

  it("прибирає пробіли", () => {
    expect(parseNumericInput(" 12 ")).toBe(12);
  });
});

describe("sanitizeNumericText (Fix 5 — no stuck leading zero)", () => {
  it("прибирає провідні нулі («07,5» → «7.5»)", () => {
    expect(sanitizeNumericText("07,5")).toBe("7.5");
    expect(sanitizeNumericText("007")).toBe("7");
  });

  it("лишає «0.» та «0» (частковий ввід дробу)", () => {
    expect(sanitizeNumericText("0.")).toBe("0.");
    expect(sanitizeNumericText("0")).toBe("0");
    expect(sanitizeNumericText("0.05")).toBe("0.05");
  });

  it("дозволяє порожнє (очищення поля)", () => {
    expect(sanitizeNumericText("")).toBe("");
  });

  it("лишає лише одну крапку", () => {
    expect(sanitizeNumericText("1.2.3")).toBe("1.23");
  });

  it("відкидає нецифрові символи", () => {
    expect(sanitizeNumericText("12abc")).toBe("12");
  });
});
