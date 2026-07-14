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
 * Реквізити одержувача — набір, який менеджер обирає перед відправкою (з
 * довідника `MgrPaymentRequisite`). За замовчуванням — ФОП Кузенко.
 */
export interface RequisiteInfo {
  recipient: string;
  edrpou?: string | null;
  bankName?: string | null;
  /** Рахунок / IBAN / номер картки. */
  iban?: string | null;
  purpose?: string | null;
}

/** Дефолтний набір реквізитів (ФОП Кузенко) — коли не передано інший. */
export const DEFAULT_REQUISITE: RequisiteInfo = {
  recipient: "ФОП КУЗЕНКО ТАРАС СТЕПАНОВИЧ",
  edrpou: "3351808816",
  bankName: 'АТ КБ "ПРИВАТБАНК"',
  iban: "UA603052990000026003010807538",
  purpose: "Оплата товару",
};

/** Рядки реквізитів одержувача (без рядка суми) з обраного набору. */
function requisiteLines(req: RequisiteInfo): string[] {
  const lines: string[] = [`Одержувач: ${req.recipient.trim()}`];
  if (req.bankName?.trim()) lines.push(`Банк: ${req.bankName.trim()}`);
  if (req.edrpou?.trim()) lines.push(`ЄДРПОУ одержувача: ${req.edrpou.trim()}`);
  if (req.iban?.trim()) {
    lines.push("Розрахунковий рахунок:");
    lines.push(req.iban.trim());
  }
  lines.push(`Призначення платежу: ${req.purpose?.trim() || "Оплата товару"}`);
  return lines;
}

/** Додаткові параметри реквізитів оплати. */
export interface PaymentRequisitesOptions {
  /** Набір реквізитів одержувача (за замовч. ФОП Кузенко). */
  requisite?: RequisiteInfo;
  /** Уже сплачено (передоплата/оплата) на момент формування, грн. */
  prepaidUah?: number;
  /** Повна сума замовлення, грн (для розбивки, коли є передоплата). */
  orderTotalUah?: number;
}

/**
 * Текст реквізитів оплати з підсумковою сумою грн (округлено).
 * `totalUah` — фактична сума ДО оплати (з урахуванням передоплат/переплат).
 * Коли є передоплата (`prepaidUah > 0`) — показуємо розбивку
 * «Сума замовлення / Передоплата / До сплати». Формат збережено навмисно.
 */
export function buildPaymentRequisitesText(
  totalUah: number,
  opts?: PaymentRequisitesOptions,
): string {
  const req = opts?.requisite ?? DEFAULT_REQUISITE;
  const prepaid = opts?.prepaidUah ?? 0;
  const orderTotal = opts?.orderTotalUah ?? totalUah + prepaid;

  const sumLines =
    prepaid > 0
      ? [
          `Сума замовлення : ${num0(orderTotal)}грн`,
          `Передоплата : ${num0(prepaid)}грн`,
          `До сплати : ${num0(totalUah)}грн`,
        ]
      : [`Сума : ${num0(totalUah)}грн`];

  return [
    "Реквізити оплати : ",
    "",
    ...requisiteLines(req),
    "",
    "Обов'язково скиньте скріншот, або фото чеку.",
    "Дякуємо за замовлення!;)",
    "",
    ...sumLines,
  ].join("\n");
}

/**
 * Текст реквізитів ПЕРЕДОПЛАТИ з сумою передоплати за мішки.
 * Передоплата = `lotCount × 500 грн` (мінімум 500 грн — рахує викликач). У тексті
 * показуємо к-сть лотів і суму. Формат реквізитів — той самий, що й у оплаті.
 */
export function buildPrepaymentRequisitesText(
  prepaymentUah: number,
  lotCount: number,
  requisite: RequisiteInfo = DEFAULT_REQUISITE,
): string {
  return [
    "Реквізити передоплати : ",
    "",
    ...requisiteLines(requisite),
    "",
    "Обов'язково скиньте скріншот, або фото чеку.",
    "Дякуємо за замовлення!;)",
    "",
    `Кількість лотів: ${num0(lotCount)}`,
    `Сума передоплати : ${num0(prepaymentUah)}грн`,
  ].join("\n");
}
