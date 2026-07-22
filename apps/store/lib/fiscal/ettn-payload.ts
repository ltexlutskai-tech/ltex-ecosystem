/**
 * Чистий білдер тіла чека Checkbox для NovaPay-накладки (ETTN).
 *
 * Правила L-TEX (рішення user):
 *  - сума чека = сума КОНТРОЛЮ ОПЛАТИ (накладки), а НЕ повна вартість реалізації;
 *  - позиції — лише 3 узагальнені групи: «Одяг вживаний» / «Взуття вживане» /
 *    «Товари для дому вживані»; ваги лотів однієї групи ДОДАЮТЬСЯ разом;
 *  - ціну рахуємо «від зворотного»: ціна за кг = сума накладки / загальна вага,
 *    рядок = вага × ціна_за_кг (кількість у чеку = вага в кг);
 *  - розбіжність округлення вирівнюємо знижкою/націнкою (Checkbox discounts);
 *  - гроші — у копійках (×100), кількість — у мілі-одиницях (×1000, тобто 1 кг =
 *    1000); оплата: type ETTN, value = сума накладки, ettn = № експрес-накладної.
 */

export interface EttnGoodInput {
  /** Загальна назва (Одяг вживаний / Взуття вживане / Товари для дому вживані). */
  name: string;
  /** Код товару Checkbox (1/2/3). */
  code: string;
  /** Сумарна вага групи, кг (ваги лотів однієї групи вже додані). */
  weightKg: number;
}

export interface EttnRequest {
  employee: string;
  cashRegister: string;
  receipt_body: {
    goods: Array<{
      good: { code: string; name: string; price: number; tax: number[] };
      quantity: number;
      is_return: boolean;
    }>;
    payments: Array<{
      type: string;
      label: string;
      value: number;
      ettn: string;
    }>;
    discounts: Array<{
      type: string;
      name: string;
      mode: string;
      value: number;
    }>;
    footer: string;
  };
}

const NOVAPAY_LABEL = "Платіж через інтегратора NovaPay";
const DEFAULT_FOOTER = "Дякуємо за покупку!";

/**
 * Будує запит чека ETTN.
 *  - `goods` — вже згруповані за загальною назвою (name+code) з сумарною вагою;
 *  - `codUah` — сума накладки/контролю оплати (₴) = підсумок чека;
 *  - `ettn` — № ТТН;
 *  - `taxCode` — код ПДВ (Без ПДВ = 8; null → без tax).
 *
 * Ціна за кг = codKop / загальна вага; рядок (Checkbox) = round(qty×price/1000),
 * де qty = вага×1000. Залишок округлення вирівнюємо знижкою/націнкою, щоб
 * підсумок дорівнював сумі накладки (інакше Checkbox: «сума чека ≠ сума накладної»).
 */
export function buildEttnRequest(input: {
  goods: EttnGoodInput[];
  codUah: number;
  ettn: string;
  taxCode?: number | null;
  footer?: string;
}): EttnRequest {
  const codKop = Math.round(input.codUah * 100);
  const tax =
    input.taxCode === null || input.taxCode === undefined
      ? []
      : [input.taxCode];

  const positive = input.goods.filter((g) => g.weightKg > 0);
  const totalWeight = positive.reduce((s, g) => s + g.weightKg, 0);

  const goods: EttnRequest["receipt_body"]["goods"] = [];
  if (positive.length > 0 && totalWeight > 0 && codKop > 0) {
    // Ціна за кг (копійки) = сума накладки / загальна вага.
    const pricePerKgKop = Math.round(codKop / totalWeight);
    for (const g of positive) {
      const qtyMilli = Math.round(g.weightKg * 1000);
      goods.push({
        good: { code: g.code, name: g.name, price: pricePerKgKop, tax },
        quantity: qtyMilli,
        is_return: false,
      });
    }
  } else if (codKop > 0) {
    // Фолбек (немає ваги) — один рядок на всю суму, кількість = 1.
    const g = input.goods[0];
    goods.push({
      good: {
        code: g?.code ?? "1",
        name: g?.name ?? "Товари вживані",
        price: codKop,
        tax,
      },
      quantity: 1000,
      is_return: false,
    });
  }

  // Підсумок так, як його порахує Checkbox (округлення на кожному рядку).
  const goodsSum = goods.reduce(
    (s, g) => s + Math.round((g.quantity * g.good.price) / 1000),
    0,
  );

  // Вирівнюємо підсумок до суми накладки знижкою/націнкою.
  const discounts: EttnRequest["receipt_body"]["discounts"] = [];
  const diff = goodsSum - codKop;
  if (diff !== 0) {
    discounts.push({
      type: diff > 0 ? "DISCOUNT" : "EXTRA_CHARGE",
      name: diff > 0 ? "Знижка (вирівнювання)" : "Націнка (вирівнювання)",
      mode: "VALUE",
      value: Math.abs(diff),
    });
  }

  return {
    employee: "",
    cashRegister: "",
    receipt_body: {
      goods,
      payments: [
        { type: "ETTN", label: NOVAPAY_LABEL, value: codKop, ettn: input.ettn },
      ],
      discounts,
      footer: input.footer ?? DEFAULT_FOOTER,
    },
  };
}
