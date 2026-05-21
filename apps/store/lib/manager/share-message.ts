/**
 * Manager «Прайс» — Stage 5a message builders («Замовити відео» + «Поділитися»).
 *
 * Pure (DB-agnostic) functions that produce the ready-to-share текст. Тексти
 * відтворюють старий 1С-функціонал торгового агента (MobileAgentLTEX):
 *
 *  • `buildVideoRequestText` — внутрішнє замовлення зйомки складу/контенту:
 *    «Треба відео / Артикул / назва / к-сть / клієнт / телефон / продавець».
 *  • `buildProductShareText` — рекламний текст для клієнта: бейджі АКЦІЯ/НОВИНКА,
 *    опис, вага (для лоту), ціна €/кг, акційна (стара закреслена), вартість лота
 *    в грн за курсом, штрих-код, контакти L-TEX, посилання YouTube.
 *
 * Без I/O — курс EUR (`rateUah`) приходить ззовні (з `getCurrentRate()` на
 * сервері). UI лише підставляє текст у редаговане поле «Поділитися».
 */

/** Контакти L-TEX для рекламного тексту (джерело — CLAUDE.md). */
export const LTEX_CONTACTS = {
  phones: ["+380 67 671 05 15", "+380 99 358 49 92"],
  telegram: "@L_TEX",
} as const;

/** Кількість днів, протягом яких товар вважається «новинкою». */
export const SHARE_NEW_WINDOW_DAYS = 14;

// ─── «Замовити відео» ───────────────────────────────────────────────────────

export interface VideoRequestParams {
  /** Артикул товара (Product.articleCode). */
  articleCode: string | null;
  /** Назва товара. */
  productName: string;
  /** Кількість штук (ціле, ≥ 1). */
  quantity: number;
  /** Назва обраного клієнта. */
  clientName: string;
  /** Телефон клієнта (як є; може бути порожній). */
  clientPhone: string | null;
  /** Продавець = ПІБ поточного менеджера. */
  sellerName: string;
}

/**
 * Будує текст-запит на зйомку відео (1С-формат, рядки в точному порядку).
 * Порожні поля (артикул/телефон) пропускаються, щоб не лишати «висячих» міток.
 *
 * ```
 * Треба відео
 * Артикул: <articleCode>
 * <назва товару>
 * <кількість> шт.
 * <клієнт.назва>
 * <клієнт.телефон>
 * <продавець>
 * ```
 */
export function buildVideoRequestText(p: VideoRequestParams): string {
  const lines: string[] = ["Треба відео"];

  const article = p.articleCode?.trim();
  if (article) lines.push(`Артикул: ${article}`);

  lines.push(p.productName.trim());
  lines.push(`${p.quantity} шт.`);
  lines.push(p.clientName.trim());

  const phone = p.clientPhone?.trim();
  if (phone) lines.push(phone);

  lines.push(p.sellerName.trim());

  return lines.join("\n");
}

// ─── «Поділитися товаром/лотом» ─────────────────────────────────────────────

/** Форматує ціну в EUR: «12.50 €». */
export function formatEur(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

/** Форматує суму в грн: «1 234 ₴» (заокруглення до цілого). */
export function formatUahAmount(amountUah: number): string {
  return `${Math.round(amountUah).toLocaleString("uk-UA")} ₴`;
}

export interface ShareLotInfo {
  /** Вага лота, кг (для вартості грн). */
  weight: number;
  /** Штрих-код лота. */
  barcode: string;
}

export interface ProductShareParams {
  /** Назва товара. */
  name: string;
  /** Артикул (Product.articleCode). */
  articleCode: string | null;
  /** Опис-прайс (необов'язковий; показується повністю, як є). */
  description?: string | null;
  /** Базова ціна €/кг (wholesale) або null коли невідома. */
  basePriceEur: number | null;
  /** Акційна ціна €/кг (akciya), якщо < базової. */
  salePriceEur?: number | null;
  /** Товар створено < SHARE_NEW_WINDOW_DAYS днів тому. */
  isNew: boolean;
  /** Посилання на YouTube-огляд (необов'язкове). */
  videoUrl?: string | null;
  /** Дані лоту (коли ділимось конкретним лотом, не товаром). */
  lot?: ShareLotInfo | null;
  /** Курс EUR → UAH для розрахунку вартості лота в грн. */
  rateUah: number;
}

/**
 * Будує рекламний текст для клієнта (товар або лот). Структура:
 *
 * ```
 * 🔥 АКЦІЯ            ← якщо salePriceEur < basePriceEur
 * 🆕 НОВИНКА          ← якщо isNew
 * <назва>
 * Артикул: <code>     ← якщо є
 *
 * <опис>             ← якщо є
 *
 * Вага лоту: <weight> кг   ← тільки для лоту
 * Ціна: <base> €/кг
 * Акційна ціна: <sale> €/кг (замість <base> €/кг)   ← якщо акція
 * Вартість лоту: ≈ <грн> ₴ (за курсом <rate>)        ← тільки для лоту
 * Штрих-код: <barcode>     ← тільки для лоту
 *
 * 📞 <phone1>, <phone2>
 * ✈️ Telegram: <@L_TEX>
 * ▶️ Відео: <youtube>      ← якщо є
 * ```
 */
export function buildProductShareText(p: ProductShareParams): string {
  const hasSale =
    p.salePriceEur != null &&
    p.basePriceEur != null &&
    p.salePriceEur < p.basePriceEur;

  const lines: string[] = [];

  // ── Бейджі ──
  if (hasSale) lines.push("🔥 АКЦІЯ");
  if (p.isNew) lines.push("🆕 НОВИНКА");

  // ── Назва + артикул ──
  lines.push(p.name.trim());
  const article = p.articleCode?.trim();
  if (article) lines.push(`Артикул: ${article}`);

  // ── Опис ── (показуємо повністю, без штучного обрізання — лише .trim())
  const desc = p.description?.trim();
  if (desc) {
    lines.push("");
    lines.push(desc);
  }

  // ── Вага / ціни / вартість грн / штрих-код ──
  const detail: string[] = [];
  if (p.lot) {
    detail.push(`Вага лоту: ${p.lot.weight.toLocaleString("uk-UA")} кг`);
  }

  if (p.basePriceEur != null) {
    if (hasSale && p.salePriceEur != null) {
      detail.push(
        `Акційна ціна: ${formatEur(p.salePriceEur)}/кг (замість ${formatEur(
          p.basePriceEur,
        )}/кг)`,
      );
    } else {
      detail.push(`Ціна: ${formatEur(p.basePriceEur)}/кг`);
    }
  }

  // Вартість лота в грн = вага × ціна (акційна, якщо є) × курс.
  if (p.lot && p.basePriceEur != null) {
    const perKg =
      hasSale && p.salePriceEur != null ? p.salePriceEur : p.basePriceEur;
    const uah = p.lot.weight * perKg * p.rateUah;
    detail.push(
      `Вартість лоту: ≈ ${formatUahAmount(uah)} (за курсом ${p.rateUah.toFixed(2)})`,
    );
  }

  if (p.lot) {
    detail.push(`Штрих-код: ${p.lot.barcode}`);
  }

  if (detail.length > 0) {
    lines.push("");
    lines.push(...detail);
  }

  // ── Контакти + відео ──
  lines.push("");
  lines.push(`📞 ${LTEX_CONTACTS.phones.join(", ")}`);
  lines.push(`✈️ Telegram: ${LTEX_CONTACTS.telegram}`);

  const video = p.videoUrl?.trim();
  if (video) lines.push(`▶️ Відео: ${video}`);

  return lines.join("\n");
}
