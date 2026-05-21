"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { PriceRow } from "@/lib/manager/prices";
import { buildProductShareText } from "@/lib/manager/share-message";
import { ProductRowMenu, type ProductRowMenuTarget } from "./product-row-menu";

interface Props {
  items: PriceRow[];
  /** Курс EUR → UAH для рекламного тексту «Поділитися». */
  rateUah: number;
  /** ПІБ поточного менеджера (продавець у запиті «Замовити відео»). */
  sellerName: string;
}

function formatPrice(value: number | null, currency: string): string {
  if (value === null) return "—";
  const symbol = currency === "EUR" ? "€" : currency;
  return `${value.toFixed(2)} ${symbol}`;
}

function formatRemaining(row: PriceRow): string {
  if (row.priceUnit === "piece") {
    return `${row.freeLotsCount} лот.`;
  }
  return `${row.remainingKg.toLocaleString("uk-UA")} кг`;
}

/** Підсвічування рядка: цільові/з відео — зелено; нові — янтарно. */
function rowHighlight(row: PriceRow): string {
  if (row.isTarget || row.hasVideo)
    return "bg-emerald-50/60 hover:bg-emerald-100/60";
  if (row.isNew) return "bg-amber-50/60 hover:bg-amber-100/60";
  return "hover:bg-gray-50";
}

/** Будує знімок товара для контекстного меню (рекламний текст — pure builder). */
function toMenuTarget(row: PriceRow, rateUah: number): ProductRowMenuTarget {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    articleCode: row.articleCode,
    videoUrl: row.videoUrl,
    shareText: buildProductShareText({
      name: row.name,
      articleCode: row.articleCode,
      description: row.description,
      basePriceEur: row.basePrice,
      salePriceEur: row.salePrice,
      isNew: row.isNew,
      videoUrl: row.videoUrl,
      rateUah,
    }),
  };
}

export function PricesList({ items, rateUah, sellerName }: Props) {
  const [menuTarget, setMenuTarget] = useState<ProductRowMenuTarget | null>(
    null,
  );
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // true коли long-press встиг відкрити меню — тоді гасимо наступний клік по
  // мобільному рядку-`<Link>`, щоб не переходити на картку товара.
  const longPressFiredRef = useRef(false);

  function openMenu(row: PriceRow, x: number, y: number) {
    setMenuTarget(toMenuTarget(row, rateUah));
    setMenuPos({ x, y });
  }

  function closeMenu() {
    setMenuTarget(null);
    setMenuPos(null);
  }

  // Long-press (~500мс) на тач-пристроях відкриває те саме меню.
  function startLongPress(row: PriceRow, x: number, y: number) {
    clearLongPress();
    longPressFiredRef.current = false;
    longPressRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      openMenu(row, x, y);
    }, 500);
  }
  function clearLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Товарів не знайдено за вибраними фільтрами.
      </div>
    );
  }

  return (
    <>
      {/* Desktop — таблиця */}
      <div className="hidden overflow-x-auto rounded-lg border bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Товар</th>
              <th className="px-4 py-2 whitespace-nowrap">Залишок</th>
              <th className="px-4 py-2 whitespace-nowrap">Ціна</th>
              <th className="px-4 py-2 whitespace-nowrap">Акція</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((row) => (
              <tr
                key={row.id}
                className={rowHighlight(row)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(row, e.clientX, e.clientY);
                }}
              >
                <td className="px-4 py-2 align-top">
                  <Link
                    href={`/manager/prices/${row.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                    {row.articleCode && <span>Арт. {row.articleCode}</span>}
                    {row.categoryName && <span>· {row.categoryName}</span>}
                    {row.isTarget && (
                      <Badge className="bg-emerald-600">Ціль</Badge>
                    )}
                    {row.isNew && <Badge className="bg-amber-500">Нове</Badge>}
                    {row.hasVideo && (
                      <Badge className="bg-sky-600">Відео</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap text-gray-800">
                  {formatRemaining(row)}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap text-gray-800">
                  {formatPrice(row.basePrice, row.currency)}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap font-semibold text-emerald-600">
                  {formatPrice(row.salePrice, row.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — картки */}
      <div className="space-y-2 md:hidden">
        {items.map((row) => (
          <Link
            key={row.id}
            href={`/manager/prices/${row.id}`}
            className={`block rounded-lg border bg-white p-3 shadow-sm ${rowHighlight(
              row,
            )}`}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(row, e.clientX, e.clientY);
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) startLongPress(row, t.clientX, t.clientY);
            }}
            onTouchEnd={clearLongPress}
            onTouchMove={clearLongPress}
            onTouchCancel={clearLongPress}
            onClick={(e) => {
              // Якщо щойно спрацював long-press — гасимо навігацію.
              if (longPressFiredRef.current) {
                e.preventDefault();
                longPressFiredRef.current = false;
              }
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-gray-900">{row.name}</span>
              <div className="flex shrink-0 gap-1">
                {row.isTarget && <Badge className="bg-emerald-600">Ціль</Badge>}
                {row.isNew && <Badge className="bg-amber-500">Нове</Badge>}
                {row.hasVideo && <Badge className="bg-sky-600">Відео</Badge>}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-gray-500">
              {row.articleCode && <span>Арт. {row.articleCode}</span>}
              {row.categoryName && <span>· {row.categoryName}</span>}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">{formatRemaining(row)}</span>
              <span className="flex items-center gap-2">
                <span className="text-gray-800">
                  {formatPrice(row.basePrice, row.currency)}
                </span>
                {row.salePrice !== null && (
                  <span className="font-semibold text-emerald-600">
                    {formatPrice(row.salePrice, row.currency)}
                  </span>
                )}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <ProductRowMenu
        target={menuTarget}
        position={menuPos}
        onClose={closeMenu}
        sellerName={sellerName}
      />
    </>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${
        className ?? "bg-gray-500"
      }`}
    >
      {children}
    </span>
  );
}
