import { describe, it, expect } from "vitest";
import {
  buildClientSaleMessage,
  buildGroupSaleMessage,
  buildPaymentRequisitesText,
  buildPrepaymentRequisitesText,
  type SaleMessageInput,
  type SaleMessageItem,
} from "./sale-message";

// Локальні дзеркала форматерів білдера — щоб expected-рядки не залежали від
// невидимих символів (uk-UA тисячний роздільник = U+00A0).
const num = (x: number): string => x.toLocaleString("uk-UA");
const money2 = (x: number): string =>
  x.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const num0 = (x: number): string => Math.round(x).toLocaleString("uk-UA");

const ITEM_A: SaleMessageItem = {
  productName: "Куртки зимові мікс (1001)",
  articleCode: "AB-123",
  barcode: "200000000123",
  quantity: 2,
  weight: 40,
  pricePerKg: 3.5,
  priceEur: 140,
};

const ITEM_B: SaleMessageItem = {
  productName: "Взуття літо (1002)",
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
    exchangeRateUsd: 39,
    cashOnDelivery: false,
    codAmountUah: null,
    notes: null,
    date: new Date("2026-05-21T10:00:00"),
    ...overrides,
  };
}

describe("buildClientSaleMessage", () => {
  it("includes client header (each value on its own line), post delivery, item line, totals, courses", () => {
    const text = buildClientSaleMessage(baseInput());
    expect(text).toContain("ФОП Іваненко");
    expect(text).toContain("Волинська обл.");
    expect(text).toContain("Луцьк");
    // phone normalized to local 0XXXXXXXXX
    expect(text).toContain("0501112233");
    expect(text).not.toContain("+380501112233");
    expect(text).toContain("Відділення пошти № 12");
    // item line: [name] вагахціна = сума (40 × 3.5 = 140)
    expect(text).toContain(
      `[Куртки зимові мікс (1001)] ${num(40)}х${num(3.5)} = ${money2(140)}`,
    );
    expect(text).toContain(`Загальна сума: ${money2(140)} €`);
    // UAH = 140 × 43 = 6020
    expect(text).toContain(`Загальна сума: *${money2(6020)} грн*`);
    expect(text).toContain(`Курс EUR ${num(43)}`);
    expect(text).toContain(`Курс USD ${num(39)}`);
    // client message must NOT carry article / barcode / per-kg suffixes
    expect(text).not.toContain("AB-123");
    expect(text).not.toContain("200000000123");
    expect(text).not.toContain("міш.");
    expect(text).not.toContain("€/кг");
  });

  it("renders pickup delivery line", () => {
    const text = buildClientSaleMessage(
      baseInput({ deliveryMethod: "pickup", novaPoshtaBranch: null }),
    );
    expect(text).toContain("Самовивіз");
    expect(text).not.toContain("Нова Пошта");
    expect(text).not.toContain("Відділення");
  });

  it("renders post without branch as 'Нова Пошта'", () => {
    const text = buildClientSaleMessage(
      baseInput({ deliveryMethod: "post", novaPoshtaBranch: null }),
    );
    expect(text).toContain("Нова Пошта");
    expect(text).not.toContain("Відділення");
  });

  it("renders adresna delivery line", () => {
    const text = buildClientSaleMessage(
      baseInput({ deliveryMethod: "delivery" }),
    );
    expect(text).toContain("Адресна доставка");
  });

  it("appends cash-on-delivery line when enabled", () => {
    const text = buildClientSaleMessage(
      baseInput({ cashOnDelivery: true, codAmountUah: 6020 }),
    );
    expect(text).toContain(`Накладений платіж: ${money2(6020)} грн`);
  });

  it("omits cash-on-delivery line when disabled", () => {
    const text = buildClientSaleMessage(baseInput());
    expect(text).not.toContain("Накладений платіж");
  });

  it("handles multiple items and renders each line total (weight × pricePerKg)", () => {
    const text = buildClientSaleMessage(
      baseInput({ items: [ITEM_A, ITEM_B], totalEur: 240 }),
    );
    expect(text).toContain("[Куртки зимові мікс (1001)]");
    expect(text).toContain(
      `[Взуття літо (1002)] ${num(20)}х${num(5)} = ${money2(100)}`,
    );
    expect(text).toContain(`Загальна сума: ${money2(240)} €`);
    // 240 × 43 = 10320
    expect(text).toContain(`Загальна сума: *${money2(10320)} грн*`);
  });

  it("handles empty items (still produces header + totals)", () => {
    const text = buildClientSaleMessage(baseInput({ items: [], totalEur: 0 }));
    expect(text).toContain("ФОП Іваненко");
    expect(text).toContain(`Загальна сума: ${money2(0)} €`);
    expect(text).not.toContain("[");
  });

  it("omits missing optional fields (region/phone)", () => {
    const text = buildClientSaleMessage(
      baseInput({ region: null, phone: null, city: "Рівне" }),
    );
    expect(text).toContain("Рівне");
    expect(text).not.toContain("Волинська");
    expect(text).not.toContain("0501112233");
  });

  it("matches the full expected layout for the sample", () => {
    const text = buildClientSaleMessage(
      baseInput({
        clientName: "Тест",
        region: "Київська",
        city: "Луцьк",
        phone: "+380501234567",
        deliveryMethod: "post",
        novaPoshtaBranch: "1",
        items: [
          {
            productName: "Товар (1)",
            articleCode: null,
            barcode: null,
            quantity: 1,
            weight: 21.9,
            pricePerKg: 3.3,
            priceEur: 72.27,
          },
        ],
        totalEur: 72.27,
        exchangeRateEur: 51.7,
        exchangeRateUsd: 43.9,
      }),
    );
    const expected = [
      "Тест",
      "Київська",
      "Луцьк",
      "0501234567",
      "Відділення пошти № 1",
      "",
      `[Товар (1)] ${num(21.9)}х${num(3.3)} = ${money2(21.9 * 3.3)}`,
      "",
      `Загальна сума: ${money2(72.27)} €`,
      `Загальна сума: *${money2(72.27 * 51.7)} грн*`,
      "",
      `Курс EUR ${num(51.7)}`,
      `Курс USD ${num(43.9)}`,
    ].join("\n");
    expect(text).toBe(expected);
  });
});

describe("buildGroupSaleMessage", () => {
  it("includes barcode in parentheses, comment and timestamp", () => {
    const text = buildGroupSaleMessage(
      baseInput({ notes: "Терміново, дзвонити" }),
    );
    expect(text).toContain(
      `[Куртки зимові мікс (1001)] (200000000123) ${num(40)}х${num(
        3.5,
      )} = ${money2(140)}`,
    );
    expect(text).toContain("Коментар: Терміново, дзвонити");
    expect(text).toContain(`Загальна сума: ${money2(140)} €`);
    expect(text).toContain(`Загальна сума: *${money2(6020)} грн*`);
    // timestamp дд.мм.рррр гг:хх:сс
    expect(text).toMatch(/21\.05\.2026 \d{2}:\d{2}:\d{2}$/);
  });

  it("omits barcode parentheses when no barcode", () => {
    const text = buildGroupSaleMessage(
      baseInput({ items: [{ ...ITEM_A, barcode: null }] }),
    );
    expect(text).toContain(
      `[Куртки зимові мікс (1001)] ${num(40)}х${num(3.5)} = ${money2(140)}`,
    );
    expect(text).not.toContain("()");
  });

  it("does not use articleCode in the group message", () => {
    const text = buildGroupSaleMessage(baseInput());
    expect(text).not.toContain("AB-123");
  });

  it("omits comment line when notes empty", () => {
    const text = buildGroupSaleMessage(baseInput({ notes: "   " }));
    expect(text).not.toContain("Коментар:");
  });

  it("appends cash-on-delivery line when enabled", () => {
    const text = buildGroupSaleMessage(
      baseInput({ cashOnDelivery: true, codAmountUah: 6020 }),
    );
    expect(text).toContain(`Накладений платіж: ${money2(6020)} грн`);
  });
});

describe("buildPaymentRequisitesText", () => {
  it("renders the ФОП requisites with rounded UAH sum", () => {
    const text = buildPaymentRequisitesText(11737);
    const expected = [
      "Реквізити оплати : ",
      "",
      "Одержувач: ФОП КУЗЕНКО ТАРАС СТЕПАНОВИЧ",
      'Банк: АТ КБ "ПРИВАТБАНК"',
      "ЄДРПОУ одержувача: 3351808816",
      "Розрахунковий рахунок:",
      "UA603052990000026003010807538",
      "Призначення платежу: Оплата товару",
      "",
      "Обов'язково скиньте скріншот, або фото чеку.",
      "Дякуємо за замовлення!;)",
      "",
      `Сума : ${num0(11737)}грн`,
    ].join("\n");
    expect(text).toBe(expected);
  });

  it("rounds fractional UAH", () => {
    const text = buildPaymentRequisitesText(11736.6);
    expect(text).toContain(`Сума : ${num0(11737)}грн`);
  });
});

describe("buildPrepaymentRequisitesText", () => {
  it("renders prepayment requisites with lot count and prepayment sum", () => {
    const text = buildPrepaymentRequisitesText(1500, 3);
    expect(text).toContain("Реквізити передоплати : ");
    expect(text).toContain("Одержувач: ФОП КУЗЕНКО ТАРАС СТЕПАНОВИЧ");
    expect(text).toContain("Кількість лотів: 3");
    expect(text).toContain(`Сума передоплати : ${num0(1500)}грн`);
  });
});
