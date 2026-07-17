"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LotGroup, LotListItem } from "@/lib/manager/lots-list";
import { CopyBarcode } from "./copy-barcode";
import { LotCardModal } from "./lot-card-modal";
import { LotRowMenu, type LotRowMenuTarget } from "./lot-row-menu";

interface Props {
  groups: LotGroup[];
  /** Курс EUR → UAH (для share-тексту лота). */
  rateUah: number;
  /** ПІБ поточного менеджера (для «Замовити відео»). */
  sellerName: string;
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
 * активна бронь має пріоритет — моя (індиго), чужа (бурштин); далі відео
 * (зелений). Відкритий мішок — бейдж у колонці «Відкрито».
 */
function rowClass(lot: LotListItem): string {
  if (lot.isMineReservation) return "bg-indigo-50 hover:bg-indigo-100";
  if (lot.isActiveReservation || lot.isReserved)
    return "bg-amber-50 hover:bg-amber-100";
  if (lot.hasVideo) return "bg-emerald-50/60 hover:bg-emerald-100/60";
  return "hover:bg-gray-50";
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Бронь-комірка/підпис: ім'я клієнта + дата «до», бейдж «ваша». */
function BookingCell({ lot }: { lot: LotListItem }) {
  if (lot.status === "in_transit") {
    return (
      <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
        У дорозі
      </span>
    );
  }
  if (!lot.isReserved && !lot.reservedForName) {
    return <span className="text-gray-400">Вільний</span>;
  }
  const badgeClass = lot.isMineReservation
    ? "bg-indigo-200 text-indigo-900"
    : lot.isActiveReservation
      ? "bg-amber-200 text-amber-900"
      : "bg-gray-200 text-gray-600";
  return (
    <div className="space-y-0.5">
      <span className={`inline-block rounded px-1.5 py-0.5 ${badgeClass}`}>
        {lot.reservedForName ?? "Заброньовано"}
      </span>
      <div className="text-[11px] text-gray-500">
        {lot.reservedUntilIso
          ? `до ${formatDateShort(lot.reservedUntilIso)}`
          : null}
        {lot.isMineReservation ? (
          <span className="ml-1 font-medium text-indigo-600">· ваша</span>
        ) : !lot.isActiveReservation && lot.reservedForName ? (
          <span className="ml-1 text-gray-400">· протермін.</span>
        ) : null}
      </div>
    </div>
  );
}

export function AllLotsList({ groups, rateUah, sellerName }: Props) {
  const [openLotId, setOpenLotId] = useState<string | null>(null);
  const [lotMenu, setLotMenu] = useState<LotRowMenuTarget | null>(null);
  const [lotMenuPos, setLotMenuPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const searchParams = useSearchParams();

  function openMenu(target: LotRowMenuTarget, x: number, y: number) {
    setLotMenu(target);
    setLotMenuPos({ x, y });
  }
  function closeMenu() {
    setLotMenu(null);
    setLotMenuPos(null);
  }

  // Авто-відкриття картки лоту з `?lotId=` (діплінк з нагадування «Перенести
  // бронь»). LotCardModal сам тягне лот за id — отже працює навіть коли лот не
  // на поточній сторінці списку. Спрацьовує один раз на монтуванні.
  useEffect(() => {
    const deepLotId = searchParams.get("lotId");
    if (deepLotId) setOpenLotId(deepLotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <LotGroupSection
          key={group.productId}
          group={group}
          onOpen={setOpenLotId}
          onOpenMenu={openMenu}
        />
      ))}

      {/* Картка лоту (Етап 3a) — перевикористана. */}
      <LotCardModal
        lotId={openLotId}
        onClose={() => setOpenLotId(null)}
        rateUah={rateUah}
        sellerName={sellerName}
      />

      <LotRowMenu
        target={lotMenu}
        position={lotMenuPos}
        onClose={closeMenu}
        onOpenCard={setOpenLotId}
        sellerName={sellerName}
      />
    </div>
  );
}

/**
 * Секція одного товару у глобальному списку — згортана (клік по шапці ховає
 * таблицю лотів). За замовчуванням розгорнута. Клік по назві товару веде на
 * картку (не згортає — `stopPropagation`).
 */
function LotGroupSection({
  group,
  onOpen,
  onOpenMenu,
}: {
  group: LotGroup;
  onOpen: (id: string) => void;
  onOpenMenu: (target: LotRowMenuTarget, x: number, y: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function menuTarget(lot: LotListItem): LotRowMenuTarget {
    return {
      lotId: lot.id,
      barcode: lot.barcode,
      productId: group.productId,
      productName: group.productName,
      articleCode: group.articleCode,
    };
  }
  function startLongPress(lot: LotListItem, x: number, y: number) {
    clearLongPress();
    longPressFired.current = false;
    longPress.current = setTimeout(() => {
      longPressFired.current = true;
      onOpenMenu(menuTarget(lot), x, y);
    }, 500);
  }
  function clearLongPress() {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
      {/* Заголовок групи — товар (артикул + назва). Клік по шапці — згорнути. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2 border-b bg-gray-50 px-4 py-2 hover:bg-gray-100"
      >
        <div className="min-w-0">
          <Link
            href={`/manager/prices/${group.productId}`}
            onClick={(e) => e.stopPropagation()}
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
        <span className="flex items-center gap-2 text-xs text-gray-400">
          лотів: {group.lots.length}
          <span
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </span>
      </div>

      {open && (
        <>
          {/* Desktop / tablet — таблиця */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2.5 py-1.5">Штрихкод</th>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Вага, кг</th>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Менеджер</th>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">
                    Дата відео
                  </th>
                  <th className="px-2.5 py-1.5">Сектор</th>
                  <th className="px-2.5 py-1.5">Бронь</th>
                  <th className="px-2.5 py-1.5 text-center">Ціль</th>
                  <th className="px-2.5 py-1.5 text-center">Відкрито</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.lots.map((lot) => (
                  <tr
                    key={lot.id}
                    onClick={() => onOpen(lot.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenMenu(menuTarget(lot), e.clientX, e.clientY);
                    }}
                    className={`cursor-pointer ${rowClass(lot)}`}
                  >
                    <td className="px-2.5 py-1.5 font-mono text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CopyBarcode value={lot.barcode} />
                        {lot.barcode}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-800">
                      {lot.weight.toLocaleString("uk-UA")}
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-700">
                      {lot.reservedByName ?? "—"}
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-700">
                      {formatDate(lot.videoDateIso)}
                    </td>
                    <td className="px-2.5 py-1.5 text-gray-700">
                      {lot.sector ?? "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-xs">
                      <BookingCell lot={lot} />
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      {lot.isTarget ? "✔" : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
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
              <div
                key={lot.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (longPressFired.current) {
                    e.preventDefault();
                    longPressFired.current = false;
                    return;
                  }
                  onOpen(lot.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenMenu(menuTarget(lot), e.clientX, e.clientY);
                }}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  if (t) startLongPress(lot, t.clientX, t.clientY);
                }}
                onTouchEnd={clearLongPress}
                onTouchMove={clearLongPress}
                onTouchCancel={clearLongPress}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onOpen(lot.id);
                }}
                className={`block w-full cursor-pointer rounded-md border p-3 text-left ${rowClass(lot)}`}
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
                  <span>· Менеджер: {lot.reservedByName ?? "—"}</span>
                  {lot.hasVideo && (
                    <span className="text-emerald-600">· відео</span>
                  )}
                  {lot.isTarget && (
                    <span className="text-gray-700">· ціль</span>
                  )}
                  {lot.isOpen && (
                    <span className="text-blue-600">· відкрито</span>
                  )}
                  {lot.reservedForName && (
                    <span
                      className={
                        lot.isMineReservation
                          ? "text-indigo-700"
                          : "text-amber-700"
                      }
                    >
                      · {lot.isMineReservation ? "ваша бронь" : "бронь"}:{" "}
                      {lot.reservedForName}
                      {lot.reservedUntilIso
                        ? ` (до ${formatDateShort(lot.reservedUntilIso)})`
                        : ""}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-gray-500">
                  <CopyBarcode value={lot.barcode} />
                  {lot.barcode}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
