"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@ltex/ui";
import {
  formatRemainingDisplay,
  priceTypeLabel,
} from "@/lib/manager/product-card";
import type { ProductCardVM, ProductLotVM } from "../_lib/load-product";
import { LotCardModal } from "./lot-card-modal";
import { OrderVideoButton } from "./order-video-button";
import { ProductClaimsPanel } from "./product-claims-panel";
import { ShareSheet } from "./share-sheet";

const SITE_BASE = "https://new.ltex.com.ua";

interface Props {
  product: ProductCardVM;
  /** Готовий рекламний текст товара (зібраний на сервері з курсом EUR). */
  productShareText: string;
  /** Курс EUR → UAH (для share-тексту лотів, будується у картці лоту). */
  rateUah: number;
  /** ПІБ поточного менеджера (продавець у запиті «Замовити відео»). */
  sellerName: string;
  /** Поточний користувач — адмін (перемикач «у штуках» лише для адміна). */
  isAdmin: boolean;
}

function formatAmount(amount: number, currency: string): string {
  const symbol = currency === "EUR" ? "€" : currency;
  return `${amount.toFixed(2)} ${symbol}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ProductCardView({
  product,
  productShareText,
  rateUah,
  sellerName,
  isAdmin,
}: Props) {
  const [showAsPieces, setShowAsPieces] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [openLotId, setOpenLotId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const { lotStats } = product;
  const remaining = formatRemainingDisplay({
    remainingKg: lotStats.remainingKg,
    freeLotsCount: lotStats.availableCount,
    priceUnit: product.priceUnit,
    unitsPerKg: product.unitsPerKg,
    showAsPieces,
  });

  const unitLabel = product.priceUnit === "piece" ? "пара/шт" : "кг";

  return (
    <div className="space-y-4">
      {/* ── Шапка ──────────────────────────────────────────────── */}
      <div className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-[280px_1fr]">
        <ImageGallery
          images={product.images}
          active={activeImage}
          onSelect={setActiveImage}
          alt={product.name}
        />

        <div className="min-w-0 space-y-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{product.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              {product.articleCode && <span>Арт. {product.articleCode}</span>}
              {product.categoryPath.length > 0 ? (
                <span title={product.categoryPath.join(" / ")}>
                  · {product.categoryPath.join(" / ")}
                </span>
              ) : (
                product.categoryName && <span>· {product.categoryName}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
            {product.basePrice ? (
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">
                  Базова ціна
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatAmount(
                    product.basePrice.amount,
                    product.basePrice.currency,
                  )}
                  <span className="ml-1 text-sm font-normal text-gray-500">
                    / {unitLabel}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Ціну не вказано</div>
            )}

            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Залишок
              </div>
              <div className="text-lg font-semibold text-gray-800">
                {remaining}
              </div>
            </div>
          </div>

          {isAdmin && product.priceUnit !== "piece" && (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showAsPieces}
                onChange={(e) => setShowAsPieces(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Відображати в штуках
            </label>
          )}

          {/* ── Кнопки/посилання ─────────────────────────────── */}
          <div className="flex flex-wrap gap-2 pt-1">
            {product.videoUrl && (
              <a
                href={product.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" variant="outline" size="sm">
                  ▶ YouTube
                </Button>
              </a>
            )}
            <a
              href={`${SITE_BASE}/product/${product.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button type="button" variant="outline" size="sm">
                Сайт ↗
              </Button>
            </a>
            <Link href={`/manager/prices/lots?productId=${product.id}`}>
              <Button type="button" variant="outline" size="sm">
                Наявні лоти ({lotStats.availableCount})
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
            >
              Поділитися
            </Button>
            <OrderVideoButton
              productName={product.name}
              articleCode={product.articleCode}
              productId={product.id}
              sellerName={sellerName}
            />
          </div>
        </div>
      </div>

      {/* ── Активні замовлення на товар (Етап 1 блоку Замовлень) ─── */}
      {product.claims ? <ProductClaimsPanel claims={product.claims} /> : null}

      {/* ── Опис-прайс (collapsible, closed за замовчуванням) ───── */}
      {product.description.trim() && (
        <CollapsibleBlock title="Опис / прайс">
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
            {product.description}
          </p>
        </CollapsibleBlock>
      )}

      {/* ── Структуровані факти ✔ (collapsible, closed) ─────────── */}
      {product.keyFacts.length > 0 && (
        <CollapsibleBlock title="Характеристики">
          <ul className="grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
            {product.keyFacts.map((fact) => (
              <li key={fact.label} className="flex gap-2">
                <span className="text-emerald-600">✔</span>
                <span className="text-gray-500">{fact.label}:</span>
                <span className="font-medium text-gray-800">{fact.value}</span>
              </li>
            ))}
          </ul>
        </CollapsibleBlock>
      )}

      {/* ── Блоки цін (collapsible) ────────────────────────────── */}
      <CollapsibleBlock
        title={`Ціни (${product.prices.sale.length})`}
        defaultOpen
      >
        {product.prices.sale.length > 0 ? (
          <PriceTable lines={product.prices.sale} />
        ) : (
          <EmptyHint>Цін не вказано.</EmptyHint>
        )}
      </CollapsibleBlock>

      <CollapsibleBlock
        title={`Ціни постачальника (${product.prices.supplier.length})`}
      >
        {product.prices.supplier.length > 0 ? (
          <PriceTable lines={product.prices.supplier} />
        ) : (
          <EmptyHint>
            Цін постачальника немає (тип ціни постачальника у базі не знайдено).
          </EmptyHint>
        )}
      </CollapsibleBlock>

      <CollapsibleBlock title={`Зарезервовано (${lotStats.reservedCount})`}>
        <EmptyHint>
          {lotStats.reservedCount > 0
            ? `Заброньовано лотів: ${lotStats.reservedCount}. Деталі — у таблиці лотів та картці кожного мішка.`
            : "Заброньованих лотів немає."}
        </EmptyHint>
      </CollapsibleBlock>

      {/* ── Лоти товару (усі) + таблиця (Етап 3a) ──────────────── */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Лоти ({product.totalLotsCount})
        </h2>
        {product.lots.length > 0 ? (
          <LotsTable lots={product.lots} onOpen={setOpenLotId} />
        ) : (
          <EmptyHint>Лотів немає.</EmptyHint>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Натисніть рядок щоб відкрити картку лоту — редагувати менеджерські
          поля та бронювати лот на клієнта. Вага, залишок, дата приходу та
          штрихкоди — лише перегляд (дані з 1С).
        </p>
      </div>

      <LotCardModal
        lotId={openLotId}
        onClose={() => setOpenLotId(null)}
        rateUah={rateUah}
        sellerName={sellerName}
      />

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Поділитися товаром"
        text={productShareText}
      />
    </div>
  );
}

// ─── Таблиця лотів (desktop) + картки (mobile) ──────────────────────────────

/**
 * Кольорова логіка рядка: активна бронь має пріоритет — моя (індиго), чужа
 * (бурштин); далі відео (зелений фон). Відкритий мішок позначається бейджем у
 * колонці «Відкрито».
 */
function rowClass(lot: ProductLotVM): string {
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

/** Бронь-комірка: ім'я клієнта + дата «до» + бейдж «ваша»/«протермін.». */
function BookingCell({ lot }: { lot: ProductLotVM }) {
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

function LotsTable({
  lots,
  onOpen,
}: {
  lots: ProductLotVM[];
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {/* Desktop / tablet — повна таблиця */}
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Прихід</th>
              <th className="px-3 py-2">Сектор</th>
              <th className="px-3 py-2 whitespace-nowrap">Вага, кг</th>
              <th className="px-3 py-2 whitespace-nowrap">Залишок</th>
              <th className="px-3 py-2 text-center">Ціль</th>
              <th className="px-3 py-2">Штрихкод</th>
              <th className="px-3 py-2">Бронь</th>
              <th className="px-3 py-2 whitespace-nowrap">Дата відео</th>
              <th className="px-3 py-2 text-center">Відкрито</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lots.map((lot) => (
              <tr
                key={lot.id}
                onClick={() => onOpen(lot.id)}
                className={`cursor-pointer ${rowClass(lot)}`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                  {formatDate(lot.arrivalIso)}
                </td>
                <td className="px-3 py-2 text-gray-700">{lot.sector ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                  {lot.weight.toLocaleString("uk-UA")}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                  {lot.quantity}
                </td>
                <td className="px-3 py-2 text-center">
                  {lot.isTarget ? "✔" : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-600">
                  {lot.barcode}
                </td>
                <td className="px-3 py-2 text-xs">
                  <BookingCell lot={lot} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                  {formatDate(lot.videoDateIso)}
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
      <div className="space-y-2 sm:hidden">
        {lots.map((lot) => (
          <button
            key={lot.id}
            type="button"
            onClick={() => onOpen(lot.id)}
            className={`block w-full rounded-md border p-3 text-left ${rowClass(lot)}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">
                {lot.weight.toLocaleString("uk-UA")} кг
              </span>
              <span className="text-xs text-gray-500">
                {formatDate(lot.arrivalIso)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>Сектор: {lot.sector ?? "—"}</span>
              <span>· Залишок: {lot.quantity}</span>
              {lot.hasVideo && (
                <span className="text-emerald-600">· відео</span>
              )}
              {lot.isTarget && <span className="text-gray-700">· ціль</span>}
              {lot.isOpen && <span className="text-blue-600">· відкрито</span>}
              {lot.reservedForName && (
                <span
                  className={
                    lot.isMineReservation ? "text-indigo-700" : "text-amber-700"
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
            <div className="mt-1 font-mono text-[11px] text-gray-500">
              {lot.barcode}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// ─── Допоміжні компоненти ─────────────────────────────────────────────────

function ImageGallery({
  images,
  active,
  onSelect,
  alt,
}: {
  images: { url: string; alt: string }[];
  active: number;
  onSelect: (i: number) => void;
  alt: string;
}) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed bg-gray-50 text-sm text-gray-400">
        Немає фото
      </div>
    );
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div className="space-y-2">
      <div className="aspect-[4/3] overflow-hidden rounded-md border bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current?.url}
          alt={current?.alt || alt}
          className="h-full w-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={img.url + i}
              type="button"
              onClick={() => onSelect(i)}
              className={`h-12 w-12 overflow-hidden rounded border ${
                i === active ? "ring-2 ring-gray-900" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt || alt}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsibleBlock({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 marker:content-none">
        <span>{title}</span>
        <span className="text-gray-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  );
}

function PriceTable({
  lines,
}: {
  lines: { priceType: string; amount: number; currency: string }[];
}) {
  return (
    <table className="min-w-full divide-y divide-gray-100 text-sm">
      <tbody>
        {lines.map((line) => (
          <tr key={line.priceType}>
            <td className="py-1.5 pr-4 text-gray-600">
              {priceTypeLabel(line.priceType)}
            </td>
            <td className="py-1.5 text-right font-medium text-gray-900">
              {formatAmount(line.amount, line.currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>;
}
