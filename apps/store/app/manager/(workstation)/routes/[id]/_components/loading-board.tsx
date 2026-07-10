"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Receipt } from "lucide-react";
import { Button } from "@ltex/ui";
import type {
  LoadingBoardOrder,
  LoadingRowColor,
} from "@/lib/manager/route-sheet-loading";
import { BarcodeInput } from "../../../sales/new/_components/barcode-input";

/** Рядок «Завантажені лоти» (підмножина RouteSheetLoadingView для деталізації). */
export interface LoadedLotRow {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  articleCode: string | null;
  productId: string;
  productName: string | null;
  barcode: string;
  weight: number;
  quantity: number;
  sum: number;
  loaded: boolean;
  isReturn: boolean;
}

export interface LoadingBoardCounters {
  ordersCount: number;
  orderedQty: number;
  loadedQty: number;
  shortageQty: number;
}

export interface LoadingBoardProps {
  board: LoadingBoardOrder[];
  loading: LoadedLotRow[];
  counters: LoadingBoardCounters;
  locked: boolean;
  /** Редагований режим (екран складу). false → лише перегляд (у менеджера). */
  editable?: boolean;
  busy?: boolean;
  autoFilling?: boolean;
  error?: string | null;
  /** Скан ШК → рядок Завантаження (targetOrderId = «у виділене замовлення»). */
  onScan?: (code: string, targetOrderId: string | null) => void;
  /** «+ Завантажити» на рядку товару → взяти вільний мішок у це замовлення. */
  onAddProduct?: (productId: string, targetOrderId: string | null) => void;
  onAutoFill?: () => void;
  onRemoveLoading?: (id: string) => void;
  onPatchLoading?: (
    id: string,
    patch: { loaded?: boolean; isReturn?: boolean },
  ) => void;
  /** Побудова лінка «Створити реалізацію» для замовлення (1С «Продажи»); подвійний
   *  клік по рядку замовлення теж веде сюди. Null → кнопки немає. */
  createSaleHrefFor?: (g: LoadingBoardOrder) => string | null;
}

const COLOR_ROW: Record<LoadingRowColor, string> = {
  green: "bg-green-50",
  yellow: "bg-amber-50",
  red: "bg-red-50",
  none: "",
};
const COLOR_DOT: Record<LoadingRowColor, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  none: "bg-gray-300",
};

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Дошка Завантаження (order-tree центральної бази 1С у нашій системі). Склад
 * бачить замовлення з переліком товару та колонками Замовлено / Завантажено /
 * Вільний залишок / Бронь + підсвітку стану (зелене — повністю; жовте —
 * прогрес; червоне — треба вантажити, а вільного немає). У редагованому режимі
 * (екран складу): скан ШК, «+ Завантажити» на рядку, авто-підбір, деталь лотів.
 */
export function LoadingBoard({
  board,
  loading,
  counters,
  locked,
  editable = false,
  busy = false,
  autoFilling = false,
  error = null,
  onScan,
  onAddProduct,
  onAutoFill,
  onRemoveLoading,
  onPatchLoading,
  createSaleHrefFor,
}: LoadingBoardProps) {
  const router = useRouter();
  // Список завантажених товарів — у складському документі показуємо одразу.
  const [showLots, setShowLots] = useState(editable);
  // Куди зараховувати скан: null = авто (за товаром), або конкретне замовлення.
  const [scanOrderId, setScanOrderId] = useState<string>("");

  const canEdit = editable && !locked;
  const scanTarget = scanOrderId || null;

  return (
    <div className="space-y-4">
      {/* Панель складу: скан + вибір замовлення + авто-підбір. */}
      {canEdit && (
        <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Скан ШК мішка
              </label>
              <BarcodeInput
                onCode={(code) => onScan?.(code, scanTarget)}
                error={error}
                disabled={busy}
              />
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Зараховувати у замовлення
              </label>
              <select
                value={scanOrderId}
                onChange={(e) => setScanOrderId(e.target.value)}
                className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              >
                <option value="">Автоматично (за товаром)</option>
                {board.map((g) => (
                  <option key={g.orderId ?? "none"} value={g.orderId ?? ""}>
                    {g.customerName ?? "Без клієнта"}
                    {g.orderNumber ? ` · №${g.orderNumber}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={autoFilling || busy}
              onClick={() => onAutoFill?.()}
            >
              {autoFilling ? "Підбір…" : "Заповнити потребу з вільних лотів"}
            </Button>
            <span className="text-xs text-gray-400">
              Або натисніть «+» на рядку товару, щоб додати один мішок.
            </span>
          </div>
        </div>
      )}

      {!canEdit && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Лічильники. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-gray-50 px-4 py-2 text-sm text-gray-600">
        <span>
          Замовлень:{" "}
          <span className="font-semibold text-gray-800">
            {counters.ordersCount}
          </span>
        </span>
        <span>
          Замовлено:{" "}
          <span className="font-semibold text-gray-800">
            {num(counters.orderedQty)}
          </span>
        </span>
        <span>
          Завантажено:{" "}
          <span className="font-semibold text-green-700">
            {num(counters.loadedQty)}
          </span>
        </span>
        <span>
          Бракує:{" "}
          <span
            className={`font-semibold ${
              counters.shortageQty > 0 ? "text-red-600" : "text-gray-800"
            }`}
          >
            {num(counters.shortageQty)}
          </span>
        </span>
      </div>

      {/* Легенда. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT.green}`} />
          Завантажено повністю
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT.yellow}`} />
          Частково
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT.red}`} />
          Немає на залишку
        </span>
      </div>

      {board.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center text-sm text-gray-500">
          Немає позицій для завантаження. Додайте замовлення до маршруту та
          натисніть «Заповнити» на вкладці Товари.
        </div>
      ) : (
        <div className="space-y-4">
          {board.map((g) => {
            const saleHref = createSaleHrefFor?.(g) ?? null;
            return (
              <div
                key={g.orderId ?? "none"}
                className="overflow-hidden rounded-lg border bg-white"
              >
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-4 py-2 ${
                    saleHref ? "cursor-pointer" : ""
                  }`}
                  onDoubleClick={
                    saleHref ? () => router.push(saleHref) : undefined
                  }
                  title={saleHref ? "Подвійний клік — створити реалізацію" : ""}
                >
                  <div className="text-sm font-medium text-gray-800">
                    {g.customerName ?? "Без клієнта"}
                    {g.city && (
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {g.city}
                      </span>
                    )}
                    {g.orderNumber && (
                      <span className="ml-2 font-mono text-xs font-normal text-gray-400">
                        №{g.orderNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      завантажено{" "}
                      <span
                        className={`font-semibold ${
                          g.loadedQty >= g.orderedQty
                            ? "text-green-700"
                            : "text-gray-800"
                        }`}
                      >
                        {num(g.loadedQty)}/{num(g.orderedQty)}
                      </span>
                      {g.soldQty > 0 && (
                        <span className="ml-2 text-blue-600">
                          продано {num(g.soldQty)}
                        </span>
                      )}
                    </span>
                    {saleHref && (
                      <Link
                        href={saleHref}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-green-600 px-2 text-xs font-medium text-white hover:bg-green-700"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        Реалізація
                      </Link>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="w-6 px-2 py-2" />
                        <th className="px-3 py-2 font-medium">Артикул</th>
                        <th className="px-3 py-2 font-medium">Товар</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Замов&shy;лено
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Заван&shy;тажено
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Про&shy;дано
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Вільний залишок
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Бронь
                        </th>
                        {canEdit && <th className="w-24 px-2 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr
                          key={r.itemId}
                          className={`border-b last:border-b-0 ${COLOR_ROW[r.color]}`}
                        >
                          <td className="px-2 py-2">
                            <span
                              className={`inline-block h-2.5 w-2.5 rounded-full ${COLOR_DOT[r.color]}`}
                              aria-hidden
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-600">
                            {r.articleCode ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-800">
                            {r.productName ?? r.productId}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {num(r.ordered)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-800">
                            {num(r.loaded)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              r.sold > 0 ? "text-blue-600" : "text-gray-400"
                            }`}
                          >
                            {r.sold > 0 ? num(r.sold) : "—"}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              r.freeStock <= 0
                                ? "font-semibold text-red-600"
                                : "text-gray-700"
                            }`}
                          >
                            {num(r.freeStock)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              r.booked > 0 ? "text-amber-600" : "text-gray-400"
                            }`}
                          >
                            {r.booked > 0 ? num(r.booked) : "—"}
                          </td>
                          {canEdit && (
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                disabled={busy || r.freeStock <= 0}
                                onClick={() =>
                                  onAddProduct?.(r.productId, g.orderId)
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                                aria-label="Завантажити мішок"
                                title={
                                  r.freeStock <= 0
                                    ? "Немає вільного мішка"
                                    : "Завантажити один мішок"
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Мішок
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Список завантажених товарів (у складі — одразу видно). */}
      {loading.length > 0 && (
        <div className="rounded-lg border bg-white">
          <button
            type="button"
            onClick={() => setShowLots((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
          >
            <span>Список завантажених товарів ({loading.length})</span>
            <span className="text-xs text-gray-400">
              {showLots ? "згорнути" : "розгорнути"}
            </span>
          </button>
          {showLots && (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Клієнт</th>
                    <th className="px-3 py-2 font-medium">Лот (ШК)</th>
                    <th className="px-3 py-2 text-right font-medium">Вага</th>
                    <th className="px-3 py-2 text-center font-medium">
                      Заван&shy;тажено
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      Повер&shy;нення
                    </th>
                    {canEdit && <th className="w-10 px-2 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {loading.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b last:border-b-0 ${
                        row.isReturn ? "bg-amber-50" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-800">
                        {row.customerName ?? "—"}
                        {row.orderNumber && (
                          <span className="ml-1 font-mono text-xs text-gray-400">
                            №{row.orderNumber}
                          </span>
                        )}
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        <div className="break-all font-mono text-xs text-gray-900">
                          {row.barcode}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {row.productName ?? row.productId}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {row.weight.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={row.loaded}
                            aria-label="Завантажено"
                            onChange={(e) =>
                              onPatchLoading?.(row.id, {
                                loaded: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                        ) : row.loaded ? (
                          <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Так
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {canEdit ? (
                          <input
                            type="checkbox"
                            checked={row.isReturn}
                            aria-label="Повернення"
                            onChange={(e) =>
                              onPatchLoading?.(row.id, {
                                isReturn: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                        ) : row.isReturn ? (
                          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Повернення
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            aria-label="Прибрати рядок завантаження"
                            onClick={() => onRemoveLoading?.(row.id)}
                            className="text-gray-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
