"use client";

import Link from "next/link";

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
 * READ-ONLY таблиця незакритих замовлень клієнта з прогресом продажів.
 *
 * Дані рахуються локально (`Sale.orderId` → `SaleItem`):
 *  - Рядки де `sold >= quantity` (продано все) — підсвічуються зеленим.
 *  - Номер замовлення — лінк на `/manager/orders/[id]`, де є робоча кнопка
 *    закриття (саме закриття у цьому блоці більше не робиться).
 */
export function ClosuresTable({ rows }: ClosuresTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-3 py-2">Замовлення</th>
            <th className="px-3 py-2">Дата</th>
            <th className="px-3 py-2">Номенклатура</th>
            <th className="px-3 py-2 text-right">Замовлено</th>
            <th className="px-3 py-2 text-right">Продано</th>
            <th className="px-3 py-2 text-right">Сума</th>
            <th className="px-3 py-2">Статус</th>
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
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/manager/orders/${row.orderUid}`}
                    className="text-green-700 underline hover:text-green-800"
                  >
                    {row.orderNumber || "—"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {fmtDate(row.orderDate)}
                </td>
                <td className="px-3 py-2 text-gray-900">{row.productName}</td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {fmtNum(row.quantity)}
                </td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {fmtNum(row.sold)}
                </td>
                <td className="px-3 py-2 text-right text-gray-900">
                  {fmtNum(row.sum)} €
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {isFullySold ? "Продано" : "Відкрите"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
