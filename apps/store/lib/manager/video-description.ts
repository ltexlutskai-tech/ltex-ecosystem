/**
 * Формування YouTube-опису відеоогляду лота (Відеозона).
 *
 * Чиста логіка (без БД): будує текст опису з характеристик лота + посилань
 * (з довідника `MgrVideoLink`) + посилання на лот на сайті + хештег-артикул +
 * штрихкод. Формат узгоджено з user (2026-07-23).
 */

export interface VideoDescriptionInput {
  season?: string | null;
  quality?: string | null; // сорт
  unitsCount?: string | null;
  unitWeight?: string | null;
  lotWeightKg?: number | null;
  gender?: string | null;
  sizes?: string | null;
  /** Посилання на лот на сайті (https://new.ltex.com.ua/lot/{barcode}). */
  lotUrl: string;
  /** Штрихкод конкретного лота. */
  barcode: string;
  /** Назва товару — з неї беремо 4-значний артикул для хештега #ltexNNNN. */
  productName: string;
  /** Резервний код (code1C) якщо в назві немає (NNNN). */
  fallbackCode?: string | null;
}

/** Довідникові посилання опису (key → url/значення). */
export type VideoLinkMap = Record<string, string>;

/**
 * Витягує 4-значний артикул із назви товару (напр. «… (0658)» → «0658»).
 * Якщо не знайдено — бере останні 4 цифри з fallbackCode. Інакше — порожньо.
 */
export function extractArticleCode4(
  productName: string,
  fallbackCode?: string | null,
): string {
  const m = productName.match(/\((\d{4})\)(?!.*\(\d{4}\))/); // останній (NNNN)
  if (m?.[1]) return m[1];
  const digits = (fallbackCode ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits;
}

function line(value: string | null | undefined): string {
  return (value ?? "").toString().trim();
}

/** Будує повний текст YouTube-опису. */
export function buildYoutubeDescription(
  input: VideoDescriptionInput,
  links: VideoLinkMap,
): string {
  const article = extractArticleCode4(input.productName, input.fallbackCode);
  const lotWeight =
    input.lotWeightKg != null && Number.isFinite(input.lotWeightKg)
      ? `${input.lotWeightKg}кг`
      : "";

  const facts: string[] = [];
  const pushFact = (label: string, v: string) => {
    if (v) facts.push(`✔️${label}: ${v}`);
  };
  pushFact("Сезон", line(input.season));
  pushFact("Сорт", line(input.quality));
  pushFact("Кількість одиниць", line(input.unitsCount));
  pushFact("Вага одиниці", line(input.unitWeight));
  pushFact("Вага лота", lotWeight);
  pushFact("Стать", line(input.gender));
  pushFact("Розміри", line(input.sizes));

  const L = (key: string) => line(links[key]);

  const parts: string[] = [];
  parts.push(facts.join("\n"));
  parts.push("");
  parts.push(`✅Замовити лот: ${input.lotUrl}`);
  parts.push("");
  if (L("price_list")) parts.push(`Отримати прайс лист: ${L("price_list")}`);
  parts.push("");
  parts.push(
    "🇺🇦Секонд Хенд Оптом - Сток Оптом - L-TEX оптовий склад Секонд Хенду",
  );
  if (L("address")) parts.push("");
  if (L("address")) parts.push(L("address"));
  parts.push("");
  if (L("phone")) parts.push(`📞 Зателефонувати: ${L("phone")}`);
  if (L("write_us")) parts.push(`📝Написати нам: ${L("write_us")}`);
  parts.push("");
  if (L("viber_group")) parts.push(`🌍 Група Viber: ${L("viber_group")}`);
  if (L("site")) parts.push(`🌍 Сайт: ${L("site")}`);
  if (L("tiktok")) parts.push(`🌍 TikTok: ${L("tiktok")}`);
  if (L("instagram")) parts.push(`🌍 Instagram: ${L("instagram")}`);
  if (L("facebook")) parts.push(`🌍 Facebook: ${L("facebook")}`);
  if (L("telegram")) parts.push(`🌍Telegram: ${L("telegram")}`);
  if (article) parts.push(`#ltex${article}`);
  parts.push(input.barcode);

  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
