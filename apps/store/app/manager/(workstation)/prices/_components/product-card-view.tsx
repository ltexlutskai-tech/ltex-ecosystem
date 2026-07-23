"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Button } from "@ltex/ui";
import { formatRemainingDisplay } from "@/lib/manager/product-card";
import type { ProductAttributeOptions } from "@/lib/manager/product-attributes";
import type { ProductCardVM, ProductLotVM } from "../_lib/load-product";
import { CopyBarcode } from "./copy-barcode";
import { LotCardModal } from "./lot-card-modal";
import { LotRowMenu, type LotRowMenuTarget } from "./lot-row-menu";
import { OrderVideoButton } from "./order-video-button";
import { ProductClaimsPanel } from "./product-claims-panel";
import { ShareSheet } from "./share-sheet";
import { ProductCharacteristicsEditor } from "../[id]/_components/product-characteristics-editor";

const SITE_BASE = "https://new.ltex.com.ua";

interface Props {
  product: ProductCardVM;
  /** Готовий рекламний текст товара (зібраний на сервері з курсом EUR). */
  productShareText: string;
  /** Курс EUR → UAH (для share-тексту лотів, будується у картці лоту). */
  rateUah: number;
  /** ПІБ поточного менеджера (продавець у запиті «Замовити відео»). */
  sellerName: string;
  /** Чи може редагувати характеристики (роль каталогу). */
  canEditCharacteristics: boolean;
  /** Власник/адмін — бачить ціни постачальника. */
  isOwnerAdmin: boolean;
  /** Опції довідників для редактора характеристик. */
  attributeOptions: ProductAttributeOptions;
  /** Список виробників для редактора характеристик. */
  producers: string[];
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
  canEditCharacteristics,
  isOwnerAdmin,
  attributeOptions,
  producers,
}: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const [openLotId, setOpenLotId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [lotMenu, setLotMenu] = useState<LotRowMenuTarget | null>(null);
  const [lotMenuPos, setLotMenuPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  function openLotMenu(lot: ProductLotVM, x: number, y: number) {
    setLotMenu({
      lotId: lot.id,
      barcode: lot.barcode,
      productId: product.id,
      productName: product.name,
      articleCode: product.articleCode,
    });
    setLotMenuPos({ x, y });
  }
  function closeLotMenu() {
    setLotMenu(null);
    setLotMenuPos(null);
  }

  const { lotStats } = product;
  const remaining = formatRemainingDisplay({
    remainingKg: lotStats.remainingKg,
    freeLotsCount: lotStats.availableCount,
    priceUnit: product.priceUnit,
    unitsPerKg: product.unitsPerKg,
    showAsPieces: false,
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

      {/* ── Характеристики (перегляд за замовчуванням + кнопка «Редагувати») ── */}
      <CollapsibleBlock title="Характеристики" defaultOpen>
        <ProductCharacteristicsEditor
          productId={product.id}
          canEdit={canEditCharacteristics}
          keyFacts={product.keyFacts}
          values={product.edit}
          attributeOptions={attributeOptions}
          producers={producers}
        />
      </CollapsibleBlock>

      {/* ── Ціни постачальника (історія закупівель) — лише власник/адмін ── */}
      {isOwnerAdmin && (
        <CollapsibleBlock
          title={`Ціни постачальника (${product.supplierPrices.length})`}
        >
          {product.supplierPrices.length > 0 ? (
            <SupplierPriceTable lines={product.supplierPrices} />
          ) : (
            <EmptyHint>
              Історії закупівельних цін немає. Реєструються автоматично при
              проведенні Поступлення (постачальник + дата + ціна).
            </EmptyHint>
          )}
        </CollapsibleBlock>
      )}

      {/* ── Лоти товару в наявності + таблиця (Етап 3a) ─────────── */}
      {/* Згортаний блок (за замовчуванням закритий) — щоб довгий список лотів
          не розтягував картку. Показуємо ЛИШЕ наявні на складі (архівні/продані
          відфільтровано у loadProductCard). */}
      <CollapsibleBlock title={`Лоти в наявності (${product.totalLotsCount})`}>
        {product.lots.length > 0 ? (
          <LotsTable
            lots={product.lots}
            onOpen={setOpenLotId}
            onOpenMenu={openLotMenu}
          />
        ) : (
          <EmptyHint>Наявних лотів немає.</EmptyHint>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Клік — відкрити картку лоту (редагування, бронь). Права кнопка (або
          довге натискання) — швидке меню. Клік по заголовку колонки —
          сортування. Показуємо лише наявні на складі мішки
          (продані/перепаковані зникають автоматично).
        </p>
      </CollapsibleBlock>

      <LotCardModal
        lotId={openLotId}
        onClose={() => setOpenLotId(null)}
        rateUah={rateUah}
        sellerName={sellerName}
      />

      <LotRowMenu
        target={lotMenu}
        position={lotMenuPos}
        onClose={closeLotMenu}
        onOpenCard={setOpenLotId}
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
        {lot.reservedByName ?? lot.reservedForName ?? "Заброньовано"}
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

type LotSortKey =
  | "arrival"
  | "sector"
  | "weight"
  | "quantity"
  | "target"
  | "videoDate";

function compareLots(
  a: ProductLotVM,
  b: ProductLotVM,
  key: LotSortKey,
): number {
  switch (key) {
    case "arrival":
      return a.arrivalIso.localeCompare(b.arrivalIso);
    case "videoDate":
      return (a.videoDateIso ?? "").localeCompare(b.videoDateIso ?? "");
    case "sector":
      return (a.sector ?? "").localeCompare(b.sector ?? "", "uk");
    case "weight":
      return a.weight - b.weight;
    case "quantity":
      return a.quantity - b.quantity;
    case "target":
      return (a.isTarget ? 1 : 0) - (b.isTarget ? 1 : 0);
  }
}

function LotsTable({
  lots,
  onOpen,
  onOpenMenu,
}: {
  lots: ProductLotVM[];
  onOpen: (id: string) => void;
  onOpenMenu: (lot: ProductLotVM, x: number, y: number) => void;
}) {
  const [sort, setSort] = useState<{ key: LotSortKey; dir: "asc" | "desc" }>({
    key: "arrival",
    dir: "desc",
  });
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const sorted = useMemo(() => {
    const arr = [...lots];
    arr.sort((a, b) => {
      const c = compareLots(a, b, sort.key);
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
  }, [lots, sort]);

  function toggleSort(key: LotSortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function startLongPress(lot: ProductLotVM, x: number, y: number) {
    clearLongPress();
    longPressFired.current = false;
    longPress.current = setTimeout(() => {
      longPressFired.current = true;
      onOpenMenu(lot, x, y);
    }, 500);
  }
  function clearLongPress() {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  }

  return (
    <>
      {/* Desktop / tablet — повна таблиця */}
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <SortableTh
                label="Прихід"
                col="arrival"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTh
                label="Сектор"
                col="sector"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTh
                label="Вага, кг"
                col="weight"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTh
                label="Залишок"
                col="quantity"
                sort={sort}
                onSort={toggleSort}
              />
              <SortableTh
                label="Ціль"
                col="target"
                sort={sort}
                onSort={toggleSort}
                center
              />
              <th className="px-3 py-2">Штрихкод</th>
              <th className="px-3 py-2">Бронь</th>
              <SortableTh
                label="Дата відео"
                col="videoDate"
                sort={sort}
                onSort={toggleSort}
              />
              <th className="px-3 py-2 text-center">Відкрито</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((lot) => (
              <tr
                key={lot.id}
                onClick={() => onOpen(lot.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onOpenMenu(lot, e.clientX, e.clientY);
                }}
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
                  <span className="inline-flex items-center gap-1.5">
                    <CopyBarcode value={lot.barcode} />
                    {lot.barcode}
                  </span>
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
        {sorted.map((lot) => (
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
              onOpenMenu(lot, e.clientX, e.clientY);
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
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-gray-500">
              <CopyBarcode value={lot.barcode} />
              {lot.barcode}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Допоміжні компоненти ─────────────────────────────────────────────────

function SortableTh({
  label,
  col,
  sort,
  onSort,
  center,
}: {
  label: string;
  col: LotSortKey;
  sort: { key: LotSortKey; dir: "asc" | "desc" };
  onSort: (col: LotSortKey) => void;
  center?: boolean;
}) {
  const active = sort.key === col;
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-gray-800 ${
        center ? "text-center" : ""
      }`}
      onClick={() => onSort(col)}
      title="Сортувати"
    >
      {label}
      <span className="ml-1 text-gray-400">
        {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
}

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

function SupplierPriceTable({
  lines,
}: {
  lines: { supplierName: string; priceEur: number; dateIso: string }[];
}) {
  return (
    <table className="min-w-full divide-y divide-gray-100 text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-gray-400">
        <tr>
          <th className="py-1.5 pr-4">Постачальник</th>
          <th className="py-1.5 pr-4">Дата</th>
          <th className="py-1.5 text-right">Ціна</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <tr key={`${line.dateIso}-${i}`}>
            <td className="py-1.5 pr-4 text-gray-700">{line.supplierName}</td>
            <td className="py-1.5 pr-4 text-gray-500">
              {formatDate(line.dateIso)}
            </td>
            <td className="py-1.5 text-right font-medium text-gray-900">
              {formatAmount(line.priceEur, "EUR")}
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
