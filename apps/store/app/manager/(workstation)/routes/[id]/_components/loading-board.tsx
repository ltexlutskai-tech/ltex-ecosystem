"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Receipt, ScanLine, PackagePlus, X } from "lucide-react";
import type {
  LoadingBoardOrder,
  LoadingRowColor,
  ReservedBagView,
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
  error?: string | null;
  /** Скан ШК → рядок Завантаження (targetOrderId = «у виділене замовлення»). */
  onScan?: (code: string, targetOrderId: string | null) => void;
  onRemoveLoading?: (id: string) => void;
  onPatchLoading?: (
    id: string,
    patch: { loaded?: boolean; isReturn?: boolean },
  ) => void;
  /** Побудова лінка «Створити реалізацію» для замовлення (1С «Продажи»); подвійний
   *  клік по рядку замовлення теж веде сюди. Null → кнопки немає. */
  createSaleHrefFor?: (g: LoadingBoardOrder) => string | null;
  /** id маршрутного листа — для завантаження списку заброньованих мішків. */
  sheetId?: string;
  /** Завантажити заброньований мішок зі списку (без скану). */
  onAddReserved?: (lotId: string, orderId: string) => void;
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
  error = null,
  onScan,
  onRemoveLoading,
  onPatchLoading,
  createSaleHrefFor,
  sheetId,
  onAddReserved,
}: LoadingBoardProps) {
  const router = useRouter();
  // Список завантажених товарів — у складському документі показуємо одразу.
  const [showLots, setShowLots] = useState(editable);
  // Замовлення, для якого відкрито окреме поле скану (кнопка «Сканувати сюди»).
  const [openScanOrderId, setOpenScanOrderId] = useState<string | null>(null);
  // Модалка «Додати заброньовані»: замовлення + завантажений список мішків.
  const [reservedFor, setReservedFor] = useState<{
    orderId: string;
    customerName: string | null;
  } | null>(null);
  const [reservedBags, setReservedBags] = useState<ReservedBagView[]>([]);
  const [reservedLoading, setReservedLoading] = useState(false);

  const canEdit = editable && !locked;
  const canReserved = canEdit && Boolean(sheetId) && Boolean(onAddReserved);

  /** Відкрити список заброньованих мішків на клієнта замовлення (GET). */
  async function openReserved(g: LoadingBoardOrder) {
    if (!g.orderId || !sheetId) return;
    setReservedFor({ orderId: g.orderId, customerName: g.customerName });
    setReservedBags([]);
    setReservedLoading(true);
    try {
      const res = await fetch(
        `/api/v1/manager/route-sheets/${sheetId}/reserved-bags?orderId=${encodeURIComponent(
          g.orderId,
        )}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { bags?: ReservedBagView[] };
        setReservedBags(data.bags ?? []);
      }
    } finally {
      setReservedLoading(false);
    }
  }

  /** Завантажити мішок зі списку → прибрати його з локального списку. */
  function addReserved(lotId: string) {
    if (!reservedFor) return;
    onAddReserved?.(lotId, reservedFor.orderId);
    setReservedBags((cur) => cur.filter((b) => b.lotId !== lotId));
  }

  return (
    <div className="space-y-4">
      {/* Панель складу: загальний скан мішка у маршрутник (авто-прив'язка). */}
      {canEdit && (
        <div className="space-y-2 rounded-lg border bg-white p-4 shadow-sm">
          <label className="block text-xs font-medium text-gray-600">
            Скан ШК мішка — додати у маршрутник
          </label>
          <BarcodeInput
            onCode={(code) => onScan?.(code, null)}
            error={openScanOrderId ? null : error}
            disabled={busy}
          />
          <p className="text-xs text-gray-400">
            Беріть будь-який мішок і скануйте — він зарахується у відповідне
            замовлення за товаром. Щоб зарахувати у конкретне замовлення —
            натисніть «Сканувати сюди» біля нього.
          </p>
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
                    {canEdit && g.orderId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenScanOrderId((cur) =>
                            cur === g.orderId ? null : g.orderId,
                          );
                        }}
                        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium ${
                          openScanOrderId === g.orderId
                            ? "border-green-600 bg-green-50 text-green-700"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <ScanLine className="h-3.5 w-3.5" />
                        Сканувати сюди
                      </button>
                    )}
                    {canReserved && g.orderId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openReserved(g);
                        }}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        <PackagePlus className="h-3.5 w-3.5" />
                        Додати заброньовані
                      </button>
                    )}
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
                {/* Окреме поле скану у це замовлення (1С «Загрузка в заказ»). */}
                {canEdit && openScanOrderId === g.orderId && g.orderId && (
                  <div className="border-b bg-green-50/40 px-4 py-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Скан ШК у замовлення «{g.customerName ?? "—"}»
                    </label>
                    <BarcodeInput
                      onCode={(code) => onScan?.(code, g.orderId)}
                      error={error}
                      disabled={busy}
                    />
                  </div>
                )}
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

      {/* Модалка «Додати заброньовані» — деталі мішків як у прайсі. */}
      {reservedFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setReservedFor(null)}
        >
          <div
            className="mt-10 w-full max-w-2xl rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">
                Заброньовані мішки — {reservedFor.customerName ?? "клієнт"}
              </h3>
              <button
                type="button"
                aria-label="Закрити"
                onClick={() => setReservedFor(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {reservedLoading ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  Завантаження…
                </p>
              ) : reservedBags.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">
                  Немає заброньованих мішків на цього клієнта (або їх уже
                  завантажено).
                </p>
              ) : (
                <ul className="space-y-2">
                  {reservedBags.map((b) => (
                    <li
                      key={b.lotId}
                      className="flex items-start justify-between gap-3 rounded-md border bg-gray-50 p-3"
                    >
                      <div className="min-w-0 text-sm">
                        <div className="font-mono text-xs text-gray-900">
                          {b.barcode}
                        </div>
                        <div className="truncate text-gray-700">
                          {b.articleCode ? `${b.articleCode} · ` : ""}
                          {b.productName ?? b.productId}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          <span>Вага: {b.weight.toFixed(1)} кг</span>
                          <span>К-сть: {b.quantity}</span>
                          {b.sector && <span>Сектор: {b.sector}</span>}
                          {b.reservedUntil && (
                            <span>
                              Бронь до:{" "}
                              {new Date(b.reservedUntil).toLocaleDateString(
                                "uk-UA",
                              )}
                            </span>
                          )}
                        </div>
                        {b.comment && (
                          <div className="mt-1 text-xs text-gray-400">
                            {b.comment}
                          </div>
                        )}
                        {b.videoUrl && (
                          <a
                            href={b.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                          >
                            Відео огляд →
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => addReserved(b.lotId)}
                        className="shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Додати
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
