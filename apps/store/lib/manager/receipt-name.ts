/**
 * Загальна назва товару для чека / друку (Checkbox ПРРО, 1С «НаименованиеЧек»).
 *
 * L-TEX продає вживані товари, тож у чек іде НЕ конкретна номенклатура, а одна з
 * трьох узагальнених назв:
 *   - «Одяг вживаний»           (clothing)
 *   - «Взуття вживане»          (shoes)
 *   - «Товари для дому вживані»  (home)
 *
 * Джерело правди — поле `Product.receiptName` (якщо заповнене вручну). Коли воно
 * порожнє — класифікуємо за деревом категорій товару (піднімаємось `parentId`
 * до кореня, звіряємо назви ланцюжка з ключовими словами).
 *
 * 1С історично використовував код «1» для одягу і «2» для решти; ми розширюємо
 * до трьох кодів (1 — одяг, 2 — взуття, 3 — товари для дому).
 *
 * Чистий модуль без залежності від prisma. Дзеркалить патерн
 * `buildProductGroupResolver` із `product-group.ts`.
 */

export type ReceiptGroup = "clothing" | "shoes" | "home";

export const RECEIPT_GROUP_NAME: Record<ReceiptGroup, string> = {
  clothing: "Одяг вживаний",
  shoes: "Взуття вживане",
  home: "Товари для дому вживані",
};

export const RECEIPT_GROUP_CODE: Record<ReceiptGroup, string> = {
  clothing: "1",
  shoes: "2",
  home: "3",
};

/** Ключові слова взуття (у назві будь-якої категорії ланцюжка). */
const SHOES_KEYWORDS = ["ВЗУТ", "ОБУВ"];

/** Ключові слова «товарів для дому». */
const HOME_KEYWORDS = [
  "ТОВАРИ ДЛЯ ДОМУ",
  "ДОМ",
  "ДІМ",
  "ГОСПОДАР",
  "ПОБУТ",
  "ІГРАШ",
  "BRIC",
  "БРИК",
  "ТЕКСТИЛ",
  "КОСМЕТ",
  "ПОСУД",
  "ПОДУШ",
  "КОВДР",
  "РУШНИК",
  "ШТОР",
];

/** Нормалізація для матчингу: верхній регістр + стиснення пробілів. */
function normalize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Класифікує групу за ланцюжком назв категорій (від листа до кореня).
 * Пріоритет: взуття → дім → одяг (дефолт). Чиста функція.
 */
export function classifyCategoryNameChain(names: string[]): ReceiptGroup {
  const normalized = names.map(normalize);

  if (normalized.some((n) => SHOES_KEYWORDS.some((kw) => n.includes(kw)))) {
    return "shoes";
  }
  if (normalized.some((n) => HOME_KEYWORDS.some((kw) => n.includes(kw)))) {
    return "home";
  }
  return "clothing";
}

/**
 * Виводить код чека (Checkbox good.code) з готової назви:
 * містить «ВЗУТ» → «2», ключове слово дому → «3», інакше → «1».
 */
export function receiptCodeForName(name: string): string {
  const n = normalize(name);
  if (SHOES_KEYWORDS.some((kw) => n.includes(kw)))
    return RECEIPT_GROUP_CODE.shoes;
  if (HOME_KEYWORDS.some((kw) => n.includes(kw)))
    return RECEIPT_GROUP_CODE.home;
  return RECEIPT_GROUP_CODE.clothing;
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ReceiptNameResult {
  group: ReceiptGroup;
  name: string;
  code: string;
}

/**
 * Будує резолвер `categoryId → {group, name, code}` з плаского списку категорій.
 * Піднімається по `parentId` до кореня (з захистом від циклів), збираючи
 * ланцюжок назв (лист → корінь), і класифікує за ключовими словами.
 * Результати кешуються по вхідному `categoryId`.
 * Відсутня/невідома категорія → одяг (дефолт).
 */
export function buildReceiptNameResolver(
  categories: readonly CategoryNode[],
): (categoryId: string | null | undefined) => ReceiptNameResult {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) byId.set(c.id, c);

  const cache = new Map<string, ReceiptNameResult>();

  function nameChainFor(categoryId: string): string[] {
    const chain: string[] = [];
    let current = byId.get(categoryId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current.name);
      if (!current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent) break; // батька нема у мапі — поточний вважаємо коренем
      current = parent;
    }
    return chain;
  }

  function resultFor(group: ReceiptGroup): ReceiptNameResult {
    return {
      group,
      name: RECEIPT_GROUP_NAME[group],
      code: RECEIPT_GROUP_CODE[group],
    };
  }

  return (categoryId) => {
    if (!categoryId) return resultFor("clothing");
    const cached = cache.get(categoryId);
    if (cached) return cached;
    const group = classifyCategoryNameChain(nameChainFor(categoryId));
    const result = resultFor(group);
    cache.set(categoryId, result);
    return result;
  };
}

/**
 * Розв'язує назву й код чека для товару.
 * Якщо `product.receiptName` — непорожній рядок, він перемагає: використовуємо
 * його як назву, а код виводимо через `receiptCodeForName`. Інакше — резолвимо
 * за деревом категорій.
 */
export function resolveReceiptName(
  product: { receiptName?: string | null; categoryId?: string | null },
  resolver: (categoryId: string | null | undefined) => ReceiptNameResult,
): { name: string; code: string } {
  const explicit = product.receiptName?.trim();
  if (explicit) {
    return { name: explicit, code: receiptCodeForName(explicit) };
  }
  const { name, code } = resolver(product.categoryId);
  return { name, code };
}
