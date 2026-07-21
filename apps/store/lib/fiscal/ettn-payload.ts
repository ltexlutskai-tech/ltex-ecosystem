/**
 * Чистий білдер тіла чека Checkbox для NovaPay-накладки (ETTN).
 *
 * Порт 1С `РеализацияТоваровУслуг.СформироватьСтруктуруЗапроса`:
 *  - позиції групуються за загальною назвою (Одяг/Взуття/Товари для дому) у 1–3
 *    рядки; сума накладки (COD) розподіляється між рядками ПРОПОРЦІЙНО їхній
 *    частці у сумі реалізації, останній рядок вбирає залишок округлення;
 *  - гроші — у копійках (×100), кількість — у мілі-одиницях (×1000);
 *  - оплата: type ETTN, label «Платіж через інтегратора NovaPay», value = COD,
 *    ettn = № експрес-накладної;
 *  - discounts балансують goods vs payment (зазвичай не потрібні — суми рівні).
 */

export interface EttnGoodInput {
  /** Загальна назва (Одяг вживаний / Взуття вживане / Товари для дому вживані). */
  name: string;
  /** Код товару Checkbox (1/2/3). */
  code: string;
  /** Частка позиції для розподілу COD (сума рядка; валюта не важлива — лише ratio). */
  share: number;
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
 *  - `goods` — вже згруповані за загальною назвою (name+code), `share` = сума
 *    рядка (для пропорції);
 *  - `codUah` — сума накладки (₴);
 *  - `ettn` — № ТТН;
 *  - `taxCode` — код ПДВ (Без ПДВ = 8; null → без tax);
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

  // Лише позиції з додатною часткою.
  const positive = input.goods.filter((g) => g.share > 0);
  const totalShare = positive.reduce((s, g) => s + g.share, 0);

  const goods: EttnRequest["receipt_body"]["goods"] = [];
  if (positive.length > 0 && totalShare > 0 && codKop > 0) {
    let allocated = 0;
    positive.forEach((g, i) => {
      const isLast = i === positive.length - 1;
      const priceKop = isLast
        ? codKop - allocated // останній вбирає залишок
        : Math.round((codKop * g.share) / totalShare);
      allocated += priceKop;
      goods.push({
        good: { code: g.code, name: g.name, price: priceKop, tax },
        quantity: 1000,
        is_return: false,
      });
    });
  }

  const goodsSum = goods.reduce((s, g) => s + g.good.price, 0);

  // Балансування (страховка від розбіжностей округлення).
  const discounts: EttnRequest["receipt_body"]["discounts"] = [];
  const diff = goodsSum - codKop;
  if (diff !== 0) {
    discounts.push({
      type: diff > 0 ? "DISCOUNT" : "EXTRA_CHARGE",
      name: diff > 0 ? "Знижка" : "Націнка",
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
