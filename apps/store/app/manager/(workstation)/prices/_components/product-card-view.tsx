"use client";

import { useState } from "react";
import { Button, useToast } from "@ltex/ui";
import {
  formatRemainingDisplay,
  priceTypeLabel,
} from "@/lib/manager/product-card";
import type { ProductCardVM } from "../_lib/load-product";

const SITE_BASE = "https://new.ltex.com.ua";

interface Props {
  product: ProductCardVM;
}

function formatAmount(amount: number, currency: string): string {
  const symbol = currency === "EUR" ? "€" : currency;
  return `${amount.toFixed(2)} ${symbol}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ProductCardView({ product }: Props) {
  const { toast } = useToast();
  const [showAsPieces, setShowAsPieces] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

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
              {product.categoryName && <span>· {product.categoryName}</span>}
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

          {product.priceUnit !== "piece" && (
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: "Наявні лоти",
                  description: "Детальна робота з лотами — у наступному етапі.",
                })
              }
            >
              Наявні лоти ({lotStats.availableCount})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                toast({
                  title: "Замовити відео",
                  description: "З'явиться у наступному етапі (Етап 5).",
                })
              }
            >
              Замовити відео
            </Button>
          </div>
        </div>
      </div>

      {/* ── Опис-прайс ─────────────────────────────────────────── */}
      {product.description.trim() && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Опис / прайс
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
            {product.description}
          </p>
        </div>
      )}

      {/* ── Структуровані факти ✔ ──────────────────────────────── */}
      {product.keyFacts.length > 0 && (
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Характеристики
          </h2>
          <ul className="grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
            {product.keyFacts.map((fact) => (
              <li key={fact.label} className="flex gap-2">
                <span className="text-emerald-600">✔</span>
                <span className="text-gray-500">{fact.label}:</span>
                <span className="font-medium text-gray-800">{fact.value}</span>
              </li>
            ))}
          </ul>
        </div>
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
            ? `Заброньовано лотів: ${lotStats.reservedCount}. Деталі броні — у наступному етапі (Етап 4).`
            : "Заброньованих лотів немає."}
        </EmptyHint>
      </CollapsibleBlock>

      {/* ── Лічильник характеристик + read-only таблиця лотів ──── */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Характеристики ({lotStats.availableCount} шт.) (
          {lotStats.withVideoCount} шт. з відео)
        </h2>
        {product.freeLots.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Прихід</th>
                  <th className="px-3 py-2 whitespace-nowrap">Вага, кг</th>
                  <th className="px-3 py-2">Штрихкод</th>
                  <th className="px-3 py-2 text-center">Відео</th>
                  <th className="px-3 py-2 text-center">Ціль</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {product.freeLots.map((lot) => (
                  <tr
                    key={lot.id}
                    className={lot.hasVideo ? "bg-emerald-50/50" : undefined}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                      {formatDate(lot.arrivalIso)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                      {lot.weight.toLocaleString("uk-UA")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {lot.barcode}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lot.hasVideo ? "✔" : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lot.isTarget ? "✔" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyHint>Вільних лотів із залишком немає.</EmptyHint>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Перегляд лотів. Картка лоту, редагування та бронь — у наступних
          етапах.
        </p>
      </div>
    </div>
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
