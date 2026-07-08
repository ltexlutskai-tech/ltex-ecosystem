"use client";

import Link from "next/link";

export interface ClosureItem {
  productUid: string;
  productName: string;
  articleCode: string | null;
  quantity: number;
  weight: number;
  unitPriceEur: number;
  sum: number;
  sold: number;
  fullySold: boolean;
}

export interface ClosureOrder {
  orderUid: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  isActual: boolean;
  closable: boolean;
  totalEur: number;
  items: ClosureItem[];
}

interface Props {
  orders: ClosureOrder[];
  /** Ключі відмічених позицій — `${orderUid}::${productUid}`. */
  selected: Set<string>;
  onToggleItem: (orderUid: string, productUid: string) => void;
  onToggleOrder: (order: ClosureOrder) => void;
  onCloseOrder: (orderUid: string) => void;
  closingOrderId: string | null;
}

export function itemKey(orderUid: string, productUid: string): string {
  return `${orderUid}::${productUid}`;
}

function fmtDate(raw: string): string {
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
 * Закриття старих замовлень (як у 1С «Закрытие заказов»): незакриті замовлення
 * клієнта, згруповані по документу; у кожному — позиції з чекбоксами «додати в
 * нове замовлення». Кнопка «Закрити замовлення» на кожному документі.
 */
export function ClosuresTable({
  orders,
  selected,
  onToggleItem,
  onToggleOrder,
  onCloseOrder,
  closingOrderId,
}: Props) {
  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const allChecked =
          order.items.length > 0 &&
          order.items.every((it) =>
            selected.has(itemKey(order.orderUid, it.productUid)),
          );
        return (
          <div
            key={order.orderUid}
            className="overflow-hidden rounded-lg border bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => onToggleOrder(order)}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="sr-only">Відмітити всі позиції</span>
                </label>
                <Link
                  href={`/manager/orders/${order.orderUid}`}
                  className="font-mono font-medium text-green-700 hover:underline"
                >
                  {order.orderNumber}
                </Link>
                <span className="text-gray-500">
                  {fmtDate(order.orderDate)}
                </span>
                {order.isActual && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                    Актуальне
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {fmtNum(order.totalEur)} €
                </span>
                {order.closable && (
                  <button
                    type="button"
                    onClick={() => onCloseOrder(order.orderUid)}
                    disabled={closingOrderId === order.orderUid}
                    className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {closingOrderId === order.orderUid
                      ? "Закриваю…"
                      : "❌ Закрити замовлення"}
                  </button>
                )}
              </div>
            </div>

            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2">Артикул</th>
                  <th className="px-3 py-2">Номенклатура</th>
                  <th className="px-3 py-2 text-right">Замовлено</th>
                  <th className="px-3 py-2 text-right">Продано</th>
                  <th className="px-3 py-2 text-right">Вага, кг</th>
                  <th className="px-3 py-2 text-right">Сума, €</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((it) => {
                  const key = itemKey(order.orderUid, it.productUid);
                  return (
                    <tr
                      key={key}
                      className={
                        it.fullySold ? "bg-green-50" : "hover:bg-gray-50"
                      }
                      data-fully-sold={it.fullySold ? "true" : "false"}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Додати ${it.productName} у нове замовлення`}
                          checked={selected.has(key)}
                          onChange={() =>
                            onToggleItem(order.orderUid, it.productUid)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-600">
                        {it.articleCode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-gray-900">
                        {it.productName}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {fmtNum(it.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {fmtNum(it.sold)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {fmtNum(it.weight)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {fmtNum(it.sum)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
