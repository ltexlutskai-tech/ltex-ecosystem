/**
 * Manager «Реалізація» — Stage 3 message builders (Viber/share text).
 *
 * Pure (DB-agnostic) функції, що відтворюють старий 1С-функціонал
 * (`Document.РеализацияТоваровУслуг → ПолучитьТекстСообщенияВайбер`) — готовий
 * текст для відправки клієнту або у внутрішню групу. UI лише підставляє текст
 * у редаговане поле `ShareSheet` (копіювати / Viber / Telegram / WhatsApp).
 *
 * Без I/O — увесь стан (курс EUR, рядки, шапка) приходить ззовні як plain
 * object, тому білдери легко будуються з form-state клієнтом і тестуються.
 *
 *  • `buildClientSaleMessage` — повідомлення клієнту: ім'я + регіон/місто/тел,
 *    рядок доставки, позиції `назва — к-ть × вага × ціна/кг = сума`, підсумки
 *    EUR+грн, післяплата (за наявності).
 *  • `buildGroupSaleMessage` — внутрішнє (у групу): ті самі позиції, але з
 *    артикулом та ШК (для Пошти), плюс коментар і дата.
 */

/** Рядок позиції реалізації (plain — будується з form-state). */
export interface SaleMessageItem {
  /** Назва товара. */
  productName: string;
  /** Артикул (Product.articleCode) — для повідомлення у групу. */
  articleCode?: string | null;
  /** Штрихкод лота — для групи при доставці Поштою. */
  barcode?: string | null;
  /** Кількість мішків (ціле ≥ 1). */
  quantity: number;
  /** Сумарна вага позиції, кг. */
  weight: number;
  /** Ціна за кг (€). */
  pricePerKg: number;
  /** Сумарна ціна позиції, € (= pricePerKg × weight × quantity). */
  priceEur: number;
}

/** Вхід білдерів — plain object (НЕ Prisma-тип), будується з form-state. */
export interface SaleMessageInput {
  /** Назва клієнта (контрагента). */
  clientName: string;
  /** Область/регіон. */
  region?: string | null;
  /** Місто. */
  city?: string | null;
  /** Телефон клієнта. */
  phone?: string | null;
  /** Спосіб доставки: post / pickup / delivery. */
  deliveryMethod?: string | null;
  /** Номер відділення Нової Пошти (для post). */
  novaPoshtaBranch?: string | null;
  /** Позиції реалізації. */
  items: SaleMessageItem[];
  /** Підсумок EUR. */
  totalEur: number;
  /** Курс EUR→UAH (знімок документа). */
  exchangeRateEur: number;
  /** Наложка (післяплата). */
  cashOnDelivery: boolean;
  /** Сума післяплати, грн (обчислена). */
  codAmountUah?: number | null;
  /** Коментар до реалізації. */
  notes?: string | null;
  /** Дата документа. */
  date: Date | string;
}

/** Форматує число з 2 знаками після коми. */
function n2(value: number): string {
  return value.toFixed(2);
}

/** Сума в EUR: «12.50 €». */
function eur(amount: number): string {
  return `${n2(amount)} €`;
}

/** Сума в грн: «1 234.00 грн» (без штучного округлення — 2 знаки). */
function uah(amount: number): string {
  return `${n2(amount)} грн`;
}

/** Рядок доставки (1С-формат) для конкретного способу. */
function deliveryLine(
  deliveryMethod: string | null | undefined,
  novaPoshtaBranch: string | null | undefined,
): string | null {
  switch (deliveryMethod) {
    case "post": {
      const branch = novaPoshtaBranch?.trim();
      return branch
        ? `Доставка: Нова Пошта, відділення №${branch}`
        : "Доставка: Нова Пошта";
    }
    case "pickup":
      return "Доставка: Самовивіз";
    case "delivery":
      return "Доставка: Адресна доставка";
    default:
      return null;
  }
}

/** Форматує дату документа у локальний формат (uk-UA, дд.мм.рррр). */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("uk-UA");
}

/** Підсумок UAH = round(EUR × курс). */
function totalUah(totalEur: number, rate: number): number {
  return Math.round(totalEur * rate);
}

/**
 * Повідомлення клієнту (контрагенту):
 *
 * ```
 * <ім'я клієнта>
 * <регіон>, <місто>          ← рядки за наявності
 * <телефон>
 * Доставка: …                ← рядок доставки за способом
 *
 * • <назва> — <к-ть> міш. × <вага> кг × <ціна/кг> €/кг = <сума> €
 * …
 *
 * Разом: <сумаEUR> € (<сумаUAH> грн)
 * Накладений платіж: <грн> грн   ← якщо Наложка
 * ```
 */
export function buildClientSaleMessage(input: SaleMessageInput): string {
  const lines: string[] = [];

  // ── Контрагент ──
  lines.push(input.clientName.trim());

  const region = input.region?.trim();
  const city = input.city?.trim();
  const place = [region, city].filter(Boolean).join(", ");
  if (place) lines.push(place);

  const phone = input.phone?.trim();
  if (phone) lines.push(phone);

  const delivery = deliveryLine(input.deliveryMethod, input.novaPoshtaBranch);
  if (delivery) lines.push(delivery);

  // ── Позиції ──
  if (input.items.length > 0) {
    lines.push("");
    for (const it of input.items) {
      lines.push(
        `• ${it.productName.trim()} — ${it.quantity} міш. × ${n2(
          it.weight,
        )} кг × ${n2(it.pricePerKg)} €/кг = ${eur(it.priceEur)}`,
      );
    }
  }

  // ── Підсумки ──
  lines.push("");
  lines.push(
    `Разом: ${eur(input.totalEur)} (${uah(
      totalUah(input.totalEur, input.exchangeRateEur),
    )})`,
  );

  if (input.cashOnDelivery && input.codAmountUah != null) {
    lines.push(`Накладений платіж: ${uah(input.codAmountUah)}`);
  }

  return lines.join("\n");
}

/**
 * Внутрішнє повідомлення (у групу): ті самі позиції, але з артикулом і ШК
 * (для доставки Поштою), плюс коментар і дата.
 *
 * ```
 * <ім'я клієнта>
 * <регіон>, <місто>
 * Доставка: …
 * Дата: <дд.мм.рррр>
 *
 * • [<артикул>] <назва> — <к-ть> міш. × <вага> кг × <ціна/кг> €/кг = <сума> €
 *   ШК <barcode>            ← окремим рядком, якщо доставка = post і ШК є
 * …
 *
 * Коментар: <notes>          ← якщо є
 *
 * Разом: <сумаEUR> € (<сумаUAH> грн)
 * Накладений платіж: <грн> грн   ← якщо Наложка
 * ```
 */
export function buildGroupSaleMessage(input: SaleMessageInput): string {
  const lines: string[] = [];

  // ── Шапка ──
  lines.push(input.clientName.trim());

  const region = input.region?.trim();
  const city = input.city?.trim();
  const place = [region, city].filter(Boolean).join(", ");
  if (place) lines.push(place);

  const delivery = deliveryLine(input.deliveryMethod, input.novaPoshtaBranch);
  if (delivery) lines.push(delivery);

  const dateStr = formatDate(input.date);
  if (dateStr) lines.push(`Дата: ${dateStr}`);

  const isPost = input.deliveryMethod === "post";

  // ── Позиції (з артикулом + ШК) ──
  if (input.items.length > 0) {
    lines.push("");
    for (const it of input.items) {
      const article = it.articleCode?.trim();
      const namePart = article
        ? `[${article}] ${it.productName.trim()}`
        : it.productName.trim();
      lines.push(
        `• ${namePart} — ${it.quantity} міш. × ${n2(it.weight)} кг × ${n2(
          it.pricePerKg,
        )} €/кг = ${eur(it.priceEur)}`,
      );
      const barcode = it.barcode?.trim();
      if (isPost && barcode) lines.push(`  ШК ${barcode}`);
    }
  }

  // ── Коментар ──
  const notes = input.notes?.trim();
  if (notes) {
    lines.push("");
    lines.push(`Коментар: ${notes}`);
  }

  // ── Підсумки ──
  lines.push("");
  lines.push(
    `Разом: ${eur(input.totalEur)} (${uah(
      totalUah(input.totalEur, input.exchangeRateEur),
    )})`,
  );

  if (input.cashOnDelivery && input.codAmountUah != null) {
    lines.push(`Накладений платіж: ${uah(input.codAmountUah)}`);
  }

  return lines.join("\n");
}
