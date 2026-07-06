import { cache } from "react";
import { prisma } from "@ltex/db";

/**
 * Ідентифікатори прихованих категорій (7.2): категорії з `hiddenFromCatalog`
 * ТА всі їхні нащадки. Товари з цих категорій НЕ показуються на сайті й
 * торговим агентам (у прайсі). Кешовано на час запиту (React `cache`).
 */
export const getHiddenCategoryIds = cache(async (): Promise<string[]> => {
  const cats = await prisma.category.findMany({
    select: { id: true, parentId: true, hiddenFromCatalog: true },
  });

  const childrenOf = new Map<string, string[]>();
  const hidden = new Set<string>();
  for (const c of cats) {
    if (c.parentId) {
      const arr = childrenOf.get(c.parentId) ?? [];
      arr.push(c.id);
      childrenOf.set(c.parentId, arr);
    }
    if (c.hiddenFromCatalog) hidden.add(c.id);
  }

  // Розкриваємо піддерево кожної прихованої категорії.
  const stack = [...hidden];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    for (const child of childrenOf.get(id) ?? []) {
      if (!hidden.has(child)) {
        hidden.add(child);
        stack.push(child);
      }
    }
  }

  return [...hidden];
});
