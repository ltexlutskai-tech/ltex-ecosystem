"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/reports/sales-flex";

/**
 * Колонка-показник для гнучкого дерева звітів (спільна для всіх flex-звітів).
 *
 * - `money` / `qty` / `weight` — підсумовуються деревом (значення з `node.values`).
 * - `percent` (з `derive`) — ОБЧИСЛЮЄТЬСЯ з агрегованих значень вузла, а не
 *   сумується (напр. «Маржа %» = валовий / виручка × 100). Рендериться як
 *   `XX.XX %`, або «—» коли `derive` повертає null.
 */
export interface IndicatorCol {
  key: string;
  label: string;
  kind: "money" | "qty" | "weight" | "percent";
  /**
   * Для `kind:"percent"` (або будь-якої похідної колонки) — обчислює значення
   * з агрегованих `values` вузла. Повертає null → рендериться «—».
   */
  derive?: (values: Record<string, number>) => number | null;
}

/** Форматування значення показника за типом. */
function fmt(col: IndicatorCol, values: Record<string, number>): string {
  if (col.kind === "percent" || col.derive) {
    const v = col.derive ? col.derive(values) : (values[col.key] ?? null);
    if (v == null) return "—";
    return `${v.toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} %`;
  }
  const n = values[col.key] ?? 0;
  if (col.kind === "money") {
    return `${n.toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;
  }
  if (col.kind === "weight") {
    return `${n.toLocaleString("uk-UA", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} кг`;
  }
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
}

/** Чи показувати значення червоним (від'ємне). Для percent — за derive-результатом. */
function isNegative(
  col: IndicatorCol,
  values: Record<string, number>,
): boolean {
  if (col.kind === "percent" || col.derive) {
    const v = col.derive ? col.derive(values) : (values[col.key] ?? null);
    return v != null && v < 0;
  }
  return (values[col.key] ?? 0) < 0;
}

/**
 * Дерево підсумків з розгортанням/згортанням вузлів. Верхній рівень
 * розгорнутий за замовчуванням; нижчі — згорнуті (клік по chevron).
 *
 * Report-agnostic: набір колонок передається через `indicators`. Похідні
 * (percent) колонки обчислюються per-node, не сумуються.
 */
export function FlexTree({
  tree,
  indicators,
  grand,
  showTotals,
}: {
  tree: TreeNode[];
  indicators: IndicatorCol[];
  grand: Record<string, number>;
  showTotals: boolean;
}) {
  // Розгорнуті ключі вузлів. Дефолт — усі вузли рівня 0.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(tree.map((n) => n.key)),
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const rows: React.ReactNode[] = [];

  function renderNode(node: TreeNode) {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.key);
    const isLeaf = !hasChildren;
    rows.push(
      <tr key={node.key} className={isLeaf ? "" : "bg-gray-50 font-medium"}>
        <td className="px-3 py-1.5 text-sm text-gray-800">
          <span
            style={{ paddingLeft: `${node.level * 1.25}rem` }}
            className="inline-flex items-center gap-1"
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(node.key)}
                aria-label={isOpen ? "Згорнути" : "Розгорнути"}
                className="w-4 text-gray-400 hover:text-gray-700"
              >
                {isOpen ? "▾" : "▸"}
              </button>
            ) : (
              <span className="inline-block w-4" />
            )}
            <span className="truncate">{node.label}</span>
          </span>
        </td>
        {indicators.map((col) => (
          <td
            key={col.key}
            className={`whitespace-nowrap px-3 py-1.5 text-right text-sm tabular-nums ${
              isNegative(col, node.values) ? "text-red-600" : "text-gray-800"
            }`}
          >
            {fmt(col, node.values)}
          </td>
        ))}
      </tr>,
    );
    if (hasChildren && isOpen) {
      for (const child of node.children) renderNode(child);
    }
  }

  for (const n of tree) renderNode(n);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Групування
            </th>
            {indicators.map((col) => (
              <th
                key={col.key}
                className="whitespace-nowrap px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={1 + indicators.length}
                className="px-3 py-6 text-center text-sm text-gray-400"
              >
                За обраними параметрами даних немає.
              </td>
            </tr>
          ) : (
            rows
          )}
          {showTotals && rows.length > 0 && (
            <tr className="border-t-2 border-gray-300 bg-emerald-50 font-semibold">
              <td className="px-3 py-2 text-sm text-gray-900">Разом</td>
              {indicators.map((col) => (
                <td
                  key={col.key}
                  className={`whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums ${
                    isNegative(col, grand) ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {fmt(col, grand)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
