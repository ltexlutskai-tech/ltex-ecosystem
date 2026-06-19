/**
 * Менеджер «Прайс» — операції над деревом категорій (сесія 5.7).
 *
 * Чисті (DB-agnostic) функції над пласким списком категорій. Дерево категорій
 * переноситься з 1С-груп Номенклатури (`Category.code1C`, `parentId`). Спільні
 * між завантажувачем прайсу (`load-prices.ts`), карткою товару та (у майбутньому)
 * вітриною магазину.
 */

/** Мінімальний вузол дерева для обчислень. */
export interface CategoryNode {
  id: string;
  parentId: string | null;
  /** Deny-list ролей (спадковість на піддерево). Порожній = видно всім. */
  hiddenForRoles?: string[];
}

/** Будує мапу parentId → дочірні id (індекс для рекурсивних обходів). */
function buildChildrenIndex(nodes: CategoryNode[]): Map<string, string[]> {
  const byParent = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const arr = byParent.get(n.parentId);
    if (arr) arr.push(n.id);
    else byParent.set(n.parentId, [n.id]);
  }
  return byParent;
}

/**
 * Збирає id кореневої категорії + усіх її нащадків (піддерево).
 * Захищено від циклів (visited-set). Повертає набір (включно з `rootId`).
 * Якщо `rootId` відсутній у списку — повертає лише сам `rootId`.
 */
export function collectCategorySubtreeIds(
  rootId: string,
  nodes: CategoryNode[],
): Set<string> {
  const byParent = buildChildrenIndex(nodes);
  const result = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    const children = byParent.get(id);
    if (children) {
      for (const c of children) {
        if (!result.has(c)) stack.push(c);
      }
    }
  }
  return result;
}

/**
 * Обчислює набір category-id, прихованих для ролі (deny-list зі спадковістю).
 * Категорія прихована, якщо вона САМА або будь-який її ПРЕДОК має `role` у
 * `hiddenForRoles`. Реалізація: знайти «корені приховання» → розгорнути на всі
 * їхні піддерева. `admin`/`owner` тут не обробляються — bypass робиться у виклику.
 */
export function collectHiddenCategoryIds(
  role: string,
  nodes: CategoryNode[],
): Set<string> {
  const hiddenRoots = nodes
    .filter((n) => (n.hiddenForRoles ?? []).includes(role))
    .map((n) => n.id);
  const hidden = new Set<string>();
  for (const rootId of hiddenRoots) {
    for (const id of collectCategorySubtreeIds(rootId, nodes)) hidden.add(id);
  }
  return hidden;
}
