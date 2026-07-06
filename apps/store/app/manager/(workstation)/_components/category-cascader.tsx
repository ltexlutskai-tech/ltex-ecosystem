"use client";

import { useMemo, useState } from "react";

export interface CascaderNode {
  id: string;
  name: string;
  parentId: string | null;
}

const selectCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/**
 * Каскадний вибір категорії рівень за рівнем (Тип → Сезон → Категорія →
 * Підкатегорія), як у 1С. Замість одного величезного списку повних шляхів —
 * кілька залежних селектів. Обране = найглибший вибраний вузол. Значення
 * подається у прихованому `<input name>` (для form action).
 *
 * allowRoot: дозволяє «Коренева (без батька)» на 1-му рівні (для вибору батька
 * нової категорії) — тоді значення порожнє.
 */
export function CategoryCascader({
  nodes,
  name,
  initialId = null,
  allowRoot = false,
  onChange,
}: {
  nodes: CascaderNode[];
  name: string;
  initialId?: string | null;
  allowRoot?: boolean;
  onChange?: (id: string) => void;
}) {
  const { byId, childrenOf, roots } = useMemo(() => {
    const byId = new Map<string, CascaderNode>();
    const childrenOf = new Map<string | null, CascaderNode[]>();
    for (const n of nodes) byId.set(n.id, n);
    for (const n of nodes) {
      const key = n.parentId && byId.has(n.parentId) ? n.parentId : null;
      const arr = childrenOf.get(key) ?? [];
      arr.push(n);
      childrenOf.set(key, arr);
    }
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, "uk"));
    }
    return { byId, childrenOf, roots: childrenOf.get(null) ?? [] };
  }, [nodes]);

  // Початковий шлях від кореня до initialId.
  const initialPath = useMemo(() => {
    const path: string[] = [];
    let cur = initialId;
    let guard = 0;
    while (cur && byId.has(cur) && guard < 12) {
      path.unshift(cur);
      cur = byId.get(cur)!.parentId;
      guard += 1;
    }
    return path;
  }, [initialId, byId]);

  const [pathState, setPathState] = useState<string[]>(initialPath);
  const effectiveId = pathState[pathState.length - 1] ?? "";

  function pick(level: number, id: string) {
    const next = id
      ? [...pathState.slice(0, level), id]
      : pathState.slice(0, level);
    setPathState(next);
    onChange?.(next[next.length - 1] ?? "");
  }

  // Будуємо селекти: рівень 0 = корені; далі — діти вибраного вузла.
  const selects: React.ReactElement[] = [];
  for (let level = 0; ; level += 1) {
    const parentId = level === 0 ? null : (pathState[level - 1] ?? null);
    const options =
      level === 0 ? roots : (childrenOf.get(pathState[level - 1] ?? "") ?? []);
    if (options.length === 0) break;
    const selected = pathState[level] ?? "";
    selects.push(
      <select
        key={level}
        value={selected}
        onChange={(e) => pick(level, e.target.value)}
        className={selectCls}
      >
        <option value="">
          {level === 0
            ? allowRoot
              ? "Коренева (без батька)"
              : "Оберіть тип…"
            : "— залишити тут / оберіть глибше —"}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>,
    );
    if (!selected) break;
    void parentId;
  }

  return (
    <div className="space-y-2">
      {selects}
      <input type="hidden" name={name} value={effectiveId} />
    </div>
  );
}
