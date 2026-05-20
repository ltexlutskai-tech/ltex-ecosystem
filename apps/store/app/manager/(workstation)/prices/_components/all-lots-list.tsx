"use client";

import { useState } from "react";
import Link from "next/link";
import type { LotGroup, LotListItem } from "@/lib/manager/lots-list";
import { LotCardModal } from "./lot-card-modal";

interface Props {
  groups: LotGroup[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Кольорова логіка рядка (як у таблиці лотів картки товару, Етап 3a):
 * бронь має пріоритет (бурштин), далі відео (зелений). Відкритий мішок —
 * бейдж у колонці «Відкрито».
 */
function rowClass(lot: LotListItem): string {
  if (lot.isReserved) return "bg-amber-50 hover:bg-amber-100";
  if (lot.hasVideo) return "bg-emerald-50/60 hover:bg-emerald-100/60";
  return "hover:bg-gray-50";
}

export function AllLotsList({ groups }: Props) {
  const [openLotId, setOpenLotId] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Лотів не знайдено за вибраними фільтрами.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={group.productId}
          className="overflow-hidden rounded-lg border bg-white shadow-sm"
        >
          {/* Заголовок групи — товар (артикул + назва) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-4 py-2">
            <div className="min-w-0">
              <Link
                href={`/manager/prices/${group.productId}`}
                className="font-medium text-gray-900 hover:underline"
              >
                {group.productName}
              </Link>
              {group.articleCode && (
                <span className="ml-2 text-xs text-gray-500">
                  Арт. {group.articleCode}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              лотів: {group.lots.length}
            </span>
          </div>

          {/* Desktop / tablet — таблиця */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Штрихкод</th>
                  <th className="px-3 py-2 whitespace-nowrap">Вага, кг</th>
                  <th className="px-3 py-2 whitespace-nowrap">Залишок</th>
                  <th className="px-3 py-2 whitespace-nowrap">Дата відео</th>
                  <th className="px-3 py-2">Сектор</th>
                  <th className="px-3 py-2">Бронь</th>
                  <th className="px-3 py-2 text-center">Ціль</th>
                  <th className="px-3 py-2 text-center">Відкрито</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.lots.map((lot) => (
                  <tr
                    key={lot.id}
                    onClick={() => setOpenLotId(lot.id)}
                    className={`cursor-pointer ${rowClass(lot)}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {lot.barcode}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                      {lot.weight.toLocaleString("uk-UA")}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {lot.quantity}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {formatDate(lot.videoDateIso)}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {lot.sector ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {lot.isReserved ? (
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 text-amber-900">
                          Заброньовано
                        </span>
                      ) : (
                        <span className="text-gray-400">Вільний</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lot.isTarget ? "✔" : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lot.isOpen ? (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                          Відкрито
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — картки */}
          <div className="space-y-2 p-3 sm:hidden">
            {group.lots.map((lot) => (
              <button
                key={lot.id}
                type="button"
                onClick={() => setOpenLotId(lot.id)}
                className={`block w-full rounded-md border p-3 text-left ${rowClass(lot)}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">
                    {lot.weight.toLocaleString("uk-UA")} кг
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDate(lot.videoDateIso)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span>Сектор: {lot.sector ?? "—"}</span>
                  <span>· Залишок: {lot.quantity}</span>
                  {lot.hasVideo && (
                    <span className="text-emerald-600">· відео</span>
                  )}
                  {lot.isTarget && (
                    <span className="text-gray-700">· ціль</span>
                  )}
                  {lot.isOpen && (
                    <span className="text-blue-600">· відкрито</span>
                  )}
                  {lot.isReserved && (
                    <span className="text-amber-700">· заброньовано</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11px] text-gray-500">
                  {lot.barcode}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Картка лоту (Етап 3a) — перевикористана. */}
      <LotCardModal lotId={openLotId} onClose={() => setOpenLotId(null)} />
    </div>
  );
}
