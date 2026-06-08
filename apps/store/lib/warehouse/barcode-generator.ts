import { prisma } from "@ltex/db";

/**
 * Генератор штрихкодів для лотів (← Тиждень 2 блоку Поступлення).
 *
 * У L-TEX 1С штрихкод мішка має паттерн «{код товара} + {порядковий номер}»
 * (наприклад `040001` = товар 4, мішок 1). У нас використовуємо людино-
 * читний пре­фікс `L-{articleCode}-{seq:05}` (наприклад `L-040-00001`) —
 * легко розрізнити на бірці.
 *
 * Узгоджено з user 2026-06-03 (питання 1): три сценарії штрихкодів —
 *   1. `scanned`   — зчитано сканером (вже існує на бірці)
 *   2. `manual`    — введено вручну (наклеєна паперова бірка)
 *   3. `generated` — згенерувати, надрукувати, наклеїти
 *
 * Ця функція реалізує сценарій 3. Унікальність гарантується перевіркою
 * у БД перед поверненням; колізії (дуже малоймовірні через high-водяний
 * знак) автоматично обходяться інкрементом.
 */

const PREFIX = "L";
const SEQ_DIGITS = 5;

/**
 * Згенерувати наступний доступний штрихкод для товару.
 * @param productId  Product.id (або code1C — пошукаємо articleCode)
 */
export async function generateLotBarcode(productId: string): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, articleCode: true, code1C: true },
  });
  if (!product) throw new Error(`Product not found: ${productId}`);

  // Базис — articleCode (3-5 символів), якщо нема — code1C, якщо й того нема —
  // перші 6 hex-символів з id (для нових товарів додавайте articleCode у admin).
  const base =
    sanitize(product.articleCode) ||
    sanitize(product.code1C) ||
    product.id
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();

  // Найбільший seq серед існуючих штрихкодів цього префіксу.
  const prefix = `${PREFIX}-${base}-`;
  const existing = await prisma.lot.findMany({
    where: { barcode: { startsWith: prefix } },
    select: { barcode: true },
  });

  let maxSeq = 0;
  for (const l of existing) {
    const m = l.barcode.match(new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`));
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  // Інкрементуємо + перевіряємо унікальність (race з паралельним проведенням).
  for (let attempt = 0; attempt < 10; attempt++) {
    const seq = maxSeq + 1 + attempt;
    const code = `${prefix}${String(seq).padStart(SEQ_DIGITS, "0")}`;
    const collision = await prisma.lot.findUnique({
      where: { barcode: code },
      select: { id: true },
    });
    if (!collision) return code;
  }
  throw new Error(
    `Не вдалося згенерувати штрихкод для productId=${productId} після 10 спроб`,
  );
}

/**
 * Парсер «зашитих» штрихкодів (сценарій 1: scanned).
 *
 * Деякі штрихкоди L-TEX вже несуть у собі код товару + вагу (формат
 * погоджуємо з постачальником). Зараз підтримуємо два паттерни:
 *
 *   1. Власний `L-{article}-{seq}` (генерує наша система) — без розбиття
 *      на додаткові поля, повертаємо лише `articleCode`.
 *   2. EAN-13 / зовнішній — повертаємо лише сирий код для пошуку в БД.
 *
 * Розширювати тут — у міру появи нових паттернів постачальників.
 */
export interface ParsedBarcode {
  raw: string;
  articleCode: string | null;
  weight: number | null;
  recognized: boolean;
  /** Який паттерн розпізнали: 'ltex-internal' | 'ltex-supplier' | 'unknown' */
  pattern: "ltex-internal" | "ltex-supplier" | "unknown";
}

/**
 * Парсер штрихкоду L-TEX (← правки 2026-06-05).
 *
 * Підтримує 2 паттерни:
 *
 *   1. **Власний паттерн `L-{article}-{seq:05}`** — генерує наша система
 *      (наприклад `L-040-00001`).
 *
 *   2. **Зашитий штрихкод постачальника** — формат `XYYYYYZTTTUUU...`
 *      довжиною ~25-26 символів де:
 *        - позиції 2-6 (1-indexed) = артикул товару (5 цифр)
 *        - позиції 9-11 (1-indexed) = вага × 10 (3 цифри: 180 = 18.0 кг)
 *      Приклад: `0370474018010000432665008t` → артикул `37047`, вага `18.0`
 *      кг. Приклад: `1640924015201301512006008T` → артикул `64092`, вага
 *      `15.2` кг. (узгоджено з user 2026-06-05)
 *
 * Сканер у формі поступлення:
 *   - Якщо `pattern='ltex-supplier'` і `articleCode` знайдено у довіднику
 *     товарів — авто-додавання рядка з відповідною вагою
 *   - Якщо нерозпізнано → раз як ШК для лоту (manual режим)
 */
export function parseBarcode(raw: string): ParsedBarcode {
  const trimmed = raw.trim();
  // Власний паттерн L-XXX-NNNNN
  const internal = trimmed.match(/^L-([A-Za-z0-9]+)-(\d+)$/);
  if (internal) {
    return {
      raw: trimmed,
      articleCode: internal[1] ?? null,
      weight: null,
      recognized: true,
      pattern: "ltex-internal",
    };
  }
  // Зашитий паттерн постачальника: довжина ≥ 12 і позиції 2-6 + 9-11 — цифри
  if (trimmed.length >= 12 && /^[A-Za-z0-9]+$/.test(trimmed)) {
    const articleRaw = trimmed.slice(1, 6); // 2-6 (1-indexed) → 1..5 (0-indexed)
    const weightRaw = trimmed.slice(8, 11); // 9-11 (1-indexed) → 8..10 (0-indexed)
    if (/^\d{5}$/.test(articleRaw) && /^\d{3}$/.test(weightRaw)) {
      const weight = parseInt(weightRaw, 10) / 10;
      return {
        raw: trimmed,
        articleCode: articleRaw,
        weight,
        recognized: true,
        pattern: "ltex-supplier",
      };
    }
  }
  return {
    raw: trimmed,
    articleCode: null,
    weight: null,
    recognized: false,
    pattern: "unknown",
  };
}

function sanitize(v: string | null | undefined): string | null {
  if (!v) return null;
  const cleaned = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.length > 0 ? cleaned.slice(0, 8) : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
