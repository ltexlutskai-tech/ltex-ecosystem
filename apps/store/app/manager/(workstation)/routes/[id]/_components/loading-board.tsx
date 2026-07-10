"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
  busy: boolean;
  autoFilling: boolean;
  error: string | null;
  onScan: (code: string) => void;
  onAutoFill: () => void;
  onRemoveLoading: (id: string) => void;
  onPatchLoading: (
    id: string,
    patch: { loaded?: boolean; isReturn?: boolean },
  ) => void;
}

/** Колір рядка позиції → tailwind-фон + бейдж стану. */
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
 * бачить замовлення з переліком товару, «Замовлено / Завантажено / Залишок
 * складу» та підсвітку стану: зелене — завантажено повністю; жовте — прогрес;
 * червоне — треба вантажити, а вільного залишку немає. Залишок враховує чужі
 * броні (заброньований лот не вільний і скан його блокує).
 */
export function LoadingBoard({
  board,
  loading,
  counters,
  locked,
  busy,
  autoFilling,
  error,
  onScan,
  onAutoFill,
  onRemoveLoading,
  onPatchLoading,
}: LoadingBoardProps) {
  const [showLots, setShowLots] = useState(false);

  return (
    <div className="space-y-4">
      {/* Скан + авто-підбір (склад). */}
      {!locked && (
        <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">
            Відскануйте штрихкод мішка (поле, USB-сканер або камера) — рядок
            автоматично зарахується у відповідне замовлення. Заброньований іншим
            менеджером мішок вантажити не можна.
          </p>
          <BarcodeInput
            onCode={(code) => onScan(code)}
            error={error}
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={autoFilling || busy}
              onClick={() => onAutoFill()}
            >
              {autoFilling ? "Підбір…" : "Заповнити з вільних лотів"}
            </Button>
            <span className="text-xs text-gray-400">
              Авто-підбір вільних лотів під замовлені позиції (без сканування).
            </span>
          </div>
        </div>
      )}

      {locked && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Лічильники (порт «Заказов: N; заказано: N; загружено: N»). */}
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

      {/* Легенда кольорів. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT.green}`} />
          Завантажено повністю
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT.yellow}`} />
          Частково (прогрес)
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
          {board.map((g) => (
            <div
              key={g.orderId ?? "none"}
              className="overflow-hidden rounded-lg border bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-4 py-2">
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
                <div className="text-xs text-gray-500">
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
                        Залишок складу
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Сума, €
                      </th>
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
                            r.stock <= 0
                              ? "font-semibold text-red-600"
                              : "text-gray-700"
                          }`}
                        >
                          {num(r.stock)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {r.sum.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Завантажені лоти (деталізація) — розгортна. */}
      {loading.length > 0 && (
        <div className="rounded-lg border bg-white">
          <button
            type="button"
            onClick={() => setShowLots((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span>Завантажені лоти ({loading.length})</span>
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
                    {!locked && <th className="w-10 px-2 py-2" />}
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
                        {locked ? (
                          row.loaded ? (
                            <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              Так
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )
                        ) : (
                          <input
                            type="checkbox"
                            checked={row.loaded}
                            aria-label="Завантажено"
                            onChange={(e) =>
                              onPatchLoading(row.id, {
                                loaded: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {locked ? (
                          row.isReturn ? (
                            <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Повернення
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )
                        ) : (
                          <input
                            type="checkbox"
                            checked={row.isReturn}
                            aria-label="Повернення"
                            onChange={(e) =>
                              onPatchLoading(row.id, {
                                isReturn: e.target.checked,
                              })
                            }
                            className="h-4 w-4"
                          />
                        )}
                      </td>
                      {!locked && (
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            aria-label="Прибрати рядок завантаження"
                            onClick={() => onRemoveLoading(row.id)}
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
