import { describe, it, expect } from "vitest";
import {
  buildClientSaleMessage,
  buildGroupSaleMessage,
  type SaleMessageInput,
  type SaleMessageItem,
} from "./sale-message";

const ITEM_A: SaleMessageItem = {
  productName: "Куртки зимові мікс",
  articleCode: "AB-123",
  barcode: "200000000123",
  quantity: 2,
  weight: 40,
  pricePerKg: 3.5,
  priceEur: 140,
};

const ITEM_B: SaleMessageItem = {
  productName: "Взуття літо",
  articleCode: "SH-007",
  barcode: "200000000777",
  quantity: 1,
  weight: 20,
  pricePerKg: 5,
  priceEur: 100,
};

function baseInput(
  overrides: Partial<SaleMessageInput> = {},
): SaleMessageInput {
  return {
    clientName: "ФОП Іваненко",
    region: "Волинська обл.",
    city: "Луцьк",
    phone: "+380501112233",
    deliveryMethod: "post",
    novaPoshtaBranch: "12",
    items: [ITEM_A],
    totalEur: 140,
    exchangeRateEur: 43,
    cashOnDelivery: false,
    codAmountUah: null,
    notes: null,
    date: new Date("2026-05-21T10:00:00Z"),
    ...overrides,
  };
}

describe("buildClientSaleMessage", () => {
  it("includes client header, post delivery with branch, item line and total", () => {
    const text = buildClientSaleMessage(baseInput());
    expect(text).toContain("ФОП Іваненко");
    expect(text).toContain("Волинська обл., Луцьк");
    expect(text).toContain("+380501112233");
    expect(text).toContain("Доставка: Нова Пошта, відділення №12");
    expect(text).toContain(
      "• Куртки зимові мікс — 2 міш. × 40.00 кг × 3.50 €/кг = 140.00 €",
    );
    // UAH = round(140 × 43) = 6020
    expect(text).toContain("Разом: 140.00 € (6020.00 грн)");
    // client message must NOT carry article / barcode
    expect(text).not.toContain("AB-123");
    expect(text).not.toContain("ШК");
  });

  it("renders pickup delivery line", () => {
    const text = buildClientSaleMessage(
      baseInput({ deliveryMethod: "pickup", novaPoshtaBranch: null }),
    );
    expect(text).toContain("Доставка: Самовивіз");
    expect(text).not.toContain("Нова Пошта");
  });

  it("renders adresna delivery line", () => {
    const text = buildClientSaleMessage(
      baseInput({ deliveryMethod: "delivery" }),
    );
    expect(text).toContain("Доставка: Адресна доставка");
  });

  it("appends cash-on-delivery line when enabled", () => {
    const text = buildClientSaleMessage(
      baseInput({ cashOnDelivery: true, codAmountUah: 6020 }),
    );
    expect(text).toContain("Накладений платіж: 6020.00 грн");
  });

  it("omits cash-on-delivery line when disabled", () => {
    const text = buildClientSaleMessage(baseInput());
    expect(text).not.toContain("Накладений платіж");
  });

  it("handles multiple items and sums into the total", () => {
    const text = buildClientSaleMessage(
      baseInput({ items: [ITEM_A, ITEM_B], totalEur: 240 }),
    );
    expect(text).toContain("• Куртки зимові мікс");
    expect(text).toContain(
      "• Взуття літо — 1 міш. × 20.00 кг × 5.00 €/кг = 100.00 €",
    );
    expect(text).toContain("Разом: 240.00 € (10320.00 грн)");
  });

  it("handles empty items (still produces header + total)", () => {
    const text = buildClientSaleMessage(baseInput({ items: [], totalEur: 0 }));
    expect(text).toContain("ФОП Іваненко");
    expect(text).toContain("Разом: 0.00 € (0.00 грн)");
    expect(text).not.toContain("•");
  });

  it("omits missing optional fields (region/phone)", () => {
    const text = buildClientSaleMessage(
      baseInput({ region: null, phone: null, city: "Рівне" }),
    );
    expect(text).toContain("Рівне");
    expect(text).not.toContain("+380");
  });
});

describe("buildGroupSaleMessage", () => {
  it("includes article, barcode (post), comment and date", () => {
    const text = buildGroupSaleMessage(
      baseInput({ notes: "Терміново, дзвонити" }),
    );
    expect(text).toContain(
      "• [AB-123] Куртки зимові мікс — 2 міш. × 40.00 кг × 3.50 €/кг = 140.00 €",
    );
    expect(text).toContain("  ШК 200000000123");
    expect(text).toContain("Коментар: Терміново, дзвонити");
    expect(text).toContain("Дата: 21.05.2026");
    expect(text).toContain("Разом: 140.00 € (6020.00 грн)");
  });

  it("omits barcode line when delivery is not post", () => {
    const text = buildGroupSaleMessage(baseInput({ deliveryMethod: "pickup" }));
    expect(text).toContain("[AB-123] Куртки зимові мікс");
    expect(text).not.toContain("ШК ");
  });

  it("omits comment line when notes empty", () => {
    const text = buildGroupSaleMessage(baseInput({ notes: "   " }));
    expect(text).not.toContain("Коментар:");
  });

  it("falls back to plain name when no articleCode", () => {
    const text = buildGroupSaleMessage(
      baseInput({ items: [{ ...ITEM_A, articleCode: null }] }),
    );
    expect(text).toContain("• Куртки зимові мікс —");
    expect(text).not.toContain("[");
  });

  it("appends cash-on-delivery line when enabled", () => {
    const text = buildGroupSaleMessage(
      baseInput({ cashOnDelivery: true, codAmountUah: 6020 }),
    );
    expect(text).toContain("Накладений платіж: 6020.00 грн");
  });
});
