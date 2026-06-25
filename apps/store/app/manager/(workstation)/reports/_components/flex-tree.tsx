"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/reports/sales-flex";

/**
 * Колонка-показник для гнучкого дерева звітів (спільна для всіх flex-звітів).
 *
 * - `money` / `qty` / `weight` — підсумовуються деревом (значення з `node.values`).
 * - `percent` — ОБЧИСЛЮЄТЬСЯ з агрегованих значень вузла (num/den × 100), а не
 *   сумується (напр. «Маржа %» = grossEur / revenueEur × 100). Рендериться як
 *   `XX.XX %`, або «—» коли знаменник 0. `percent` — серіалізовані ключі
 *   (не функція), бо колонки передаються із Server- у Client-компонент.
 */
export interface IndicatorCol {
  key: string;
  label: string;
  kind: "money" | "qty" | "weight" | "percent";
  /**
   * Для `kind:"percent"` — ключі чисельника/знаменника у `node.values`;
   * значення = num / den × 100 (null коли den = 0).
   */
  percent?: { num: string; den: string };
}

/**
 * Атрибутна (довідкова) колонка для product-leaf рядків (стиль 1С «Остатки
 * товаров»). На відміну від `IndicatorCol`, НЕ сумується деревом — значення
 * береться з `node.attrs[key]` і показується лише на вузлах, що відповідають
 * одному товару (де `attrs` заповнено).
 */
export interface AttrCol {
  key: string;
  label: string;
  kind: "text" | "money" | "qty";
}

/** Форматування значення атрибутної колонки (порожньо, коли значення відсутнє). */
function fmtAttr(col: AttrCol, attrs?: Record<string, string | number | null>) {
  if (!attrs || !(col.key in attrs)) return "";
  const v = attrs[col.key];
  if (v == null) return "";
  if (col.kind === "money") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return "";
    return `${n.toLocaleString("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} €`;
  }
  if (col.kind === "qty") {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isNaN(n)) return "";
    return n.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
  }
  return String(v);
}

/** Значення відсоткової колонки з агрегатів вузла (null коли знаменник 0). */
function percentValue(
  col: IndicatorCol,
  values: Record<string, number>,
): number | null {
  if (!col.percent) return values[col.key] ?? null;
  const den = values[col.percent.den] ?? 0;
  if (den === 0) return null;
  const num = values[col.percent.num] ?? 0;
  return Math.round((num / den) * 100 * 100) / 100;
}

/** Форматування значення показника за типом. */
function fmt(col: IndicatorCol, values: Record<string, number>): string {
  if (col.kind === "percent") {
    const v = percentValue(col, values);
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

/** Чи показувати значення червоним (від'ємне). Для percent — за обчисленим значенням. */
function isNegative(
  col: IndicatorCol,
  values: Record<string, number>,
): boolean {
  if (col.kind === "percent") {
    const v = percentValue(col, values);
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
  attrColumns = [],
}: {
  tree: TreeNode[];
  indicators: IndicatorCol[];
  grand: Record<string, number>;
  showTotals: boolean;
  /**
   * Довідкові колонки товару (стиль 1С «Остатки товаров»). Показуються лише на
   * product-leaf рядках (де заповнено `node.attrs`). За замовчуванням порожньо —
   * інші звіти (sales/margin/cashflow) їх не передають.
   */
  attrColumns?: AttrCol[];
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
        {attrColumns.map((col) => (
          <td
            key={col.key}
            className={`whitespace-nowrap px-3 py-1.5 text-sm text-gray-600 ${
              col.kind === "text" ? "text-left" : "text-right tabular-nums"
            }`}
          >
            {fmtAttr(col, node.attrs)}
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
            {attrColumns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 ${
                  col.kind === "text" ? "text-left" : "text-right"
                }`}
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
                colSpan={1 + indicators.length + attrColumns.length}
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
              {attrColumns.map((col) => (
                <td key={col.key} className="px-3 py-2" />
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
