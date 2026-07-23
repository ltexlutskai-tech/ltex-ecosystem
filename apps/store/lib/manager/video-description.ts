/**
 * Формування YouTube-опису відеоогляду лота (Відеозона).
 *
 * Чиста логіка (без БД): будує текст опису у форматі, узгодженому з реальними
 * описами L-TEX на YouTube (2026-07-23):
 *
 *   #ltex{article} {hashtags}
 *   ✅ Сезон: …            (усі 7 характеристик — завжди, з «-» коли порожньо)
 *   ✅ Сорт: …
 *   …
 *   ────────────
 *   ✅ Замовити лот: {lotUrl}
 *   📄 Переглянути каталог: {catalog}
 *   🇺🇦 Секонд Хенд Оптом | Сток Оптом | L-TEX …
 *   📍 {address}   📞 {phone}   📝 Написати нам: {write_us}
 *   ────────────
 *   🔗 МИ В СОЦМЕРЕЖАХ:  (Viber/Telegram/Сайт/TikTok/Instagram/Facebook — де є значення)
 *   #ltex{article}
 *   {barcode}
 *
 * Значення посилань беруться з довідника `MgrVideoLink` (VideoLinkMap).
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

const SEP = "────────────────";
const DASH = "-";

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

function s(value: string | null | undefined): string {
  return (value ?? "").toString().trim();
}

/** «14.1» → «14,1кг». Порожнє → «-». */
function fmtWeightKg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return DASH;
  const rounded = Math.round(n * 100) / 100;
  return `${String(rounded).replace(".", ",")}кг`;
}

/** Вага одиниці (вільний рядок): суто число → «N,Nкг», інакше як є. Порожнє → «-». */
function fmtUnitWeight(v: string | null | undefined): string {
  const t = s(v);
  if (!t) return DASH;
  if (/^\d+([.,]\d+)?$/.test(t)) return `${t.replace(".", ",")}кг`;
  return t;
}

/** Кількість одиниць: суто число → «Nшт», інакше як є. Порожнє → «-». */
function fmtUnits(v: string | null | undefined): string {
  const t = s(v);
  if (!t) return DASH;
  if (/^\d+$/.test(t)) return `${t}шт`;
  return t;
}

/** Будує повний текст YouTube-опису. */
export function buildYoutubeDescription(
  input: VideoDescriptionInput,
  links: VideoLinkMap,
): string {
  const article = extractArticleCode4(input.productName, input.fallbackCode);
  const L = (key: string) => s(links[key]);

  const parts: string[] = [];

  // 1. Хештеги зверху: #ltexNNNN + додаткові (#секондхендоптом #стокоптом).
  const topTags = [article ? `#ltex${article}` : "", L("hashtags")]
    .filter(Boolean)
    .join(" ");
  if (topTags) parts.push(topTags);

  // 2. Характеристики — усі 7, завжди (з «-» коли порожньо).
  parts.push(`✅ Сезон: ${s(input.season) || DASH}`);
  parts.push(`✅ Сорт: ${s(input.quality) || DASH}`);
  parts.push(`✅ Кількість одиниць: ${fmtUnits(input.unitsCount)}`);
  parts.push(`✅ Вага одиниці: ${fmtUnitWeight(input.unitWeight)}`);
  parts.push(`✅ Вага лота: ${fmtWeightKg(input.lotWeightKg)}`);
  parts.push(`✅ Стать: ${s(input.gender) || DASH}`);
  parts.push(`✅ Розміри: ${s(input.sizes) || DASH}`);

  // 3. Замовлення лота + каталог.
  parts.push("");
  parts.push(SEP);
  parts.push("");
  parts.push(`✅ Замовити лот: ${input.lotUrl}`);
  if (L("catalog")) parts.push(`📄 Переглянути каталог: ${L("catalog")}`);

  // 4. Шапка + контакти.
  parts.push("");
  parts.push(
    "🇺🇦 Секонд Хенд Оптом | Сток Оптом | L-TEX — оптовий склад Секонд Хенду",
  );
  if (L("address")) parts.push(`📍 ${L("address")}`);
  if (L("phone")) parts.push(`📞 Зателефонувати: ${L("phone")}`);
  if (L("write_us")) parts.push(`📝 Написати нам: ${L("write_us")}`);

  // 5. Соцмережі (лише ті, де є значення).
  const socials: [string, string][] = (
    [
      ["🟣 Viber група", L("viber_group")],
      ["📘 Telegram", L("telegram")],
      ["📘 Telegram bric-a-brac", L("telegram_bric")],
      ["🟢 Сайт", L("site")],
      ["🟢 Сайт bric-a-brac", L("site_bric")],
      ["🎵 TikTok", L("tiktok")],
      ["📷 Instagram", L("instagram")],
      ["👍 Facebook", L("facebook")],
    ] as [string, string][]
  ).filter(([, v]) => v);

  if (socials.length > 0) {
    parts.push("");
    parts.push(SEP);
    parts.push("");
    parts.push("🔗 МИ В СОЦМЕРЕЖАХ:");
    for (const [label, url] of socials) parts.push(`${label}: ${url}`);
  }

  // 6. Хештег + штрихкод унизу.
  parts.push("");
  if (article) parts.push(`#ltex${article}`);
  parts.push(input.barcode);

  return parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
