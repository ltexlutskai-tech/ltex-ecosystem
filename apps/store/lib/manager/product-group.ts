/**
 * Класифікація товару на дві основні групи L-TEX — **Сток** та **Секонд хенд**
 * (ТЗ 2026-07-17, для звіту менеджера).
 *
 * Джерело правди — **коренева папка категорії у дереві 1С**: у 1С основна
 * розбивка номенклатури — це батьківські папки «СТОК» та «СЕКОНД ХЕНД» (плюс
 * службові «Роздріб»/«Перепаковка»/«Паливо»/«Більше не брати»). Тому групу
 * товару визначаємо, піднявшись деревом `Category.parentId` до кореня і
 * звіривши його назву.
 *
 * Усе, що не належить до СТОК/СЕКОНД (службові папки, товари поза деревом 1С,
 * curated-категорії сайту без 1С-кореня), потрапляє у групу `other` — щоб не
 * приписувати їх помилково до жодної з основних груп.
 */

export type ProductGroup = "stock" | "second" | "other";

export const PRODUCT_GROUP_LABEL: Record<ProductGroup, string> = {
  stock: "Сток",
  second: "Секонд хенд",
  other: "Інше",
};

/**
 * Класифікує групу за назвою КОРЕНЕВОЇ категорії. Чиста функція.
 * Матчинг нечутливий до регістру/пробілів: «СТОК» → stock, назва, що містить
 * «СЕКОНД» («СЕКОНД ХЕНД») → second, решта → other.
 */
export function classifyByRootName(
  rootName: string | null | undefined,
): ProductGroup {
  if (!rootName) return "other";
  const n = rootName.trim().toUpperCase();
  if (n.includes("СТОК")) return "stock";
  if (n.includes("СЕКОНД")) return "second";
  return "other";
}

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Будує резолвер `categoryId → ProductGroup` з плаского списку категорій.
 * Піднімається по `parentId` до кореня (з захистом від циклів) і класифікує
 * за назвою кореня. Результати кешуються по вхідному `categoryId`.
 */
export function buildProductGroupResolver(
  categories: readonly CategoryNode[],
): (categoryId: string | null | undefined) => ProductGroup {
  const byId = new Map<string, CategoryNode>();
  for (const c of categories) byId.set(c.id, c);

  const cache = new Map<string, ProductGroup>();

  function rootNameFor(categoryId: string): string | null {
    let current = byId.get(categoryId);
    const seen = new Set<string>();
    while (current && current.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = byId.get(current.parentId);
      if (!parent) break; // батька нема у мапі — поточний вважаємо коренем
      current = parent;
    }
    return current ? current.name : null;
  }

  return (categoryId) => {
    if (!categoryId) return "other";
    const cached = cache.get(categoryId);
    if (cached) return cached;
    const group = classifyByRootName(rootNameFor(categoryId));
    cache.set(categoryId, group);
    return group;
  };
}
