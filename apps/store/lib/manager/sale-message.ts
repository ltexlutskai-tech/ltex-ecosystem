/**
 * Manager «Реалізація» — Stage 3 message builders (Viber/share text).
 *
 * Pure (DB-agnostic) функції, що відтворюють старий 1С-функціонал
 * (`Document.РеализацияТоваровУслуг → ПолучитьТекстСообщенияВайбер`) — готовий
 * текст для відправки клієнту або у внутрішню групу. UI лише підставляє текст
 * у редаговане поле `ShareSheet` (копіювати / Viber / Telegram / WhatsApp).
 *
 * Без I/O — увесь стан (курс EUR/USD, рядки, шапка) приходить ззовні як plain
 * object, тому білдери легко будуються з form-state клієнтом і тестуються.
 *
 *  • `buildClientSaleMessage` — повідомлення клієнту: ім'я + регіон/місто/тел,
 *    рядок доставки, позиції `[назва] вагахціна = сума`, підсумки EUR+грн,
 *    курси EUR/USD, післяплата (за наявності).
 *  • `buildGroupSaleMessage` — внутрішнє (у групу): ті самі позиції, але з ШК
 *    (для Пошти), плюс коментар і дата-час документа.
 *  • `buildPaymentRequisitesText` — текст реквізитів оплати (ФОП) з сумою грн.
 */

import { normalizePhone } from "@ltex/shared";

/** Рядок позиції реалізації (plain — будується з form-state). */
export interface SaleMessageItem {
  /** Назва товара (повна — вже містить код у дужках). */
  productName: string;
  /** Артикул (Product.articleCode) — більше не використовується у тексті. */
  articleCode?: string | null;
  /** Штрихкод лота — для групи (у дужках біля назви, за наявності). */
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
  /** Курс USD→UAH (знімок документа). */
  exchangeRateUsd: number;
  /** Наложка (післяплата). */
  cashOnDelivery: boolean;
  /** Сума післяплати, грн (обчислена). */
  codAmountUah?: number | null;
  /** Коментар до реалізації. */
  notes?: string | null;
  /** Дата документа. */
  date: Date | string;
}

/** Число з природними десятковими (uk-UA: кома + пробіл-роздільник тисяч). */
function num(value: number): string {
  return value.toLocaleString("uk-UA");
}

/** Число з рівно 2 знаками після коми (uk-UA). */
function money2(value: number): string {
  return value.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Округлене ціле (uk-UA, пробіл-роздільник тисяч). */
function num0(value: number): string {
  return Math.round(value).toLocaleString("uk-UA");
}

/** Телефон у локальний `0XXXXXXXXX` (з `+380…`); інакше — як є. */
function localPhone(raw: string | null | undefined): string | null {
  const phone = raw?.trim();
  if (!phone) return null;
  const normalized = normalizePhone(phone);
  if (normalized && normalized.startsWith("+380")) {
    return `0${normalized.slice(4)}`;
  }
  // Fallback: простий обмін провідного +380 на 0.
  if (phone.startsWith("+380")) return `0${phone.slice(4)}`;
  return phone;
}

/** Рядок доставки (заголовок) для конкретного способу, або null. */
function deliveryLine(
  deliveryMethod: string | null | undefined,
  novaPoshtaBranch: string | null | undefined,
): string | null {
  switch (deliveryMethod) {
    case "post": {
      const branch = novaPoshtaBranch?.trim();
      return branch ? `Відділення пошти № ${branch}` : "Нова Пошта";
    }
    case "pickup":
      return "Самовивіз";
    case "delivery":
      return "Адресна доставка";
    default:
      return null;
  }
}

/** Дата-час документа у форматі `дд.мм.рррр гг:хх:сс` (24h, uk-UA). */
function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
}

/** Спільна шапка повідомлення (ім'я / регіон / місто / тел / доставка). */
function headerLines(input: SaleMessageInput): string[] {
  const lines: string[] = [];

  const name = input.clientName.trim();
  if (name) lines.push(name);

  const region = input.region?.trim();
  if (region) lines.push(region);

  const city = input.city?.trim();
  if (city) lines.push(city);

  const phone = localPhone(input.phone);
  if (phone) lines.push(phone);

  const delivery = deliveryLine(input.deliveryMethod, input.novaPoshtaBranch);
  if (delivery) lines.push(delivery);

  return lines;
}

/** Підсумкові рядки (сума EUR/грн + наложка + курси). */
function totalsLines(input: SaleMessageInput): string[] {
  const lines: string[] = [];

  lines.push(`Загальна сума: ${money2(input.totalEur)} €`);
  lines.push(
    `Загальна сума: *${money2(input.totalEur * input.exchangeRateEur)} грн*`,
  );

  if (input.cashOnDelivery && input.codAmountUah != null) {
    lines.push(`Накладений платіж: ${money2(input.codAmountUah)} грн`);
  }

  lines.push("");
  lines.push(`Курс EUR ${num(input.exchangeRateEur)}`);
  lines.push(`Курс USD ${num(input.exchangeRateUsd)}`);

  return lines;
}

/**
 * Повідомлення клієнту (контрагенту):
 *
 * ```
 * <ім'я клієнта>
 * <регіон>
 * <місто>
 * <телефон 0XXXXXXXXX>
 * <рядок доставки>
 *
 * [<назва>] <вага>х<ціна/кг> = <сума>
 * …
 *
 * Загальна сума: <EUR> €
 * Загальна сума: *<грн> грн*
 * Накладений платіж: <грн> грн   ← якщо Наложка
 *
 * Курс EUR <курс>
 * Курс USD <курс>
 * ```
 */
export function buildClientSaleMessage(input: SaleMessageInput): string {
  const lines: string[] = [...headerLines(input)];

  if (input.items.length > 0) {
    lines.push("");
    for (const it of input.items) {
      const lineTotal = it.weight * it.pricePerKg;
      lines.push(
        `[${it.productName.trim()}] ${num(it.weight)}х${num(
          it.pricePerKg,
        )} = ${money2(lineTotal)}`,
      );
    }
  }

  lines.push("");
  lines.push(...totalsLines(input));

  return lines.join("\n");
}

/**
 * Внутрішнє повідомлення (у групу): ті самі позиції, але з ШК (у дужках біля
 * назви, за наявності), плюс коментар і дата-час документа в кінці.
 *
 * ```
 * <шапка як у клієнта>
 *
 * [<назва>] (<ШК>) <вага>х<ціна/кг> = <сума>
 * …
 *
 * Загальна сума: <EUR> €
 * Загальна сума: *<грн> грн*
 *
 * Курс EUR <курс>
 * Курс USD <курс>
 * Коментар: <notes>          ← якщо є
 *
 * <дд.мм.рррр гг:хх:сс>
 * ```
 */
export function buildGroupSaleMessage(input: SaleMessageInput): string {
  const lines: string[] = [...headerLines(input)];

  if (input.items.length > 0) {
    lines.push("");
    for (const it of input.items) {
      const lineTotal = it.weight * it.pricePerKg;
      const barcode = it.barcode?.trim();
      const barcodePart = barcode ? `(${barcode}) ` : "";
      lines.push(
        `[${it.productName.trim()}] ${barcodePart}${num(it.weight)}х${num(
          it.pricePerKg,
        )} = ${money2(lineTotal)}`,
      );
    }
  }

  lines.push("");
  lines.push(...totalsLines(input));

  const notes = input.notes?.trim();
  if (notes) {
    lines.push(`Коментар: ${notes}`);
  }

  lines.push("");
  lines.push(formatDateTime(input.date));

  return lines.join("\n");
}

/**
 * Текст реквізитів оплати (ФОП КУЗЕНКО) з підсумковою сумою грн (округлено).
 * Точний формат збережено навмисно (включно з пробілами після «:»).
 */
export function buildPaymentRequisitesText(totalUah: number): string {
  return [
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
    `Сума : ${num0(totalUah)}грн`,
  ].join("\n");
}
