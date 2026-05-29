"use client";

import { useCallback } from "react";

export interface ClosureRow {
  orderUid: string;
  orderNumber: string;
  orderDate: string;
  productUid: string;
  productName: string;
  quantity: number;
  sum: number;
  sold: number;
  status: string;
}

interface ClosuresTableProps {
  rows: ClosureRow[];
  addToNewOrder: Record<string, boolean>;
  onToggleAddToNew: (rowKey: string, checked: boolean) => void;
}

function fmtDate(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtNum(n: number): string {
  return Number(n).toLocaleString("uk-UA");
}

/**
 * Read-only таблиця незакритих замовлень з 1С + чекбокс «Додати в нове».
 *
 * Особливості 1С-форми (port-овано з MobileAgent):
 *  - Рядки де `sold >= quantity` (продано все або більше) — підсвічуються
 *    зеленим (як у v0-формі CSS-style `BackColor=Green`).
 *  - Рядки можна тільки редагувати у колонці «Додати в нове замовлення»
 *    (read-only решта).
 */
export function ClosuresTable({
  rows,
  addToNewOrder,
  onToggleAddToNew,
}: ClosuresTableProps) {
  const handleChange = useCallback(
    (rowKey: string) =>
      (event: React.ChangeEvent<HTMLInputElement>): void => {
        onToggleAddToNew(rowKey, event.target.checked);
      },
    [onToggleAddToNew],
  );

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2">Замовлення</th>
            <th className="px-3 py-2">Дата</th>
            <th className="px-3 py-2">Номенклатура</th>
            <th className="px-3 py-2 text-right">Замовлено</th>
            <th className="px-3 py-2 text-right">Сума</th>
            <th className="px-3 py-2 text-right">Продано</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2 text-center">Додати в нове</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const rowKey = `${row.orderUid}::${row.productUid}`;
            const isFullySold = row.sold >= row.quantity && row.quantity > 0;
            return (
              <tr
                key={rowKey}
                className={
                  isFullySold
                    ? "bg-green-50 hover:bg-green-100"
                    : "hover:bg-gray-50"
                }
                data-fully-sold={isFullySold ? "true" : "false"}
              >
                <td className="px-3 py-2 font-mono text-xs text-gray-700">
                  {row.orderNumber || "—"}
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {fmtDate(row.orderDate)}
                </td>
                <td className="px-3 py-2 text-gray-900">{row.productName}</td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {fmtNum(row.quantity)}
                </td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {fmtNum(row.sum)} €
                </td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {fmtNum(row.sold)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {row.status || "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={addToNewOrder[rowKey] === true}
                    onChange={handleChange(rowKey)}
                    aria-label={`Додати ${row.productName} у нове замовлення`}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
