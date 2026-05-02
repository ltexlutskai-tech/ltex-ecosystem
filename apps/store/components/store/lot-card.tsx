"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Play, Plus, Check, Video as VideoIcon } from "lucide-react";
import { useCart, cartItemKey } from "@/lib/cart";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/youtube";
import { eurToUah, formatUah } from "@/lib/exchange-rate";
import { VideoModal } from "./video-modal";
import { QuickOrderModal } from "./quick-order-modal";

export interface LotCardLot {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  priceEur: number;
  videoUrl: string | null;
  status: string;
  /** ISO date — used to show "NEW" badge for lots younger than 14 days. */
  createdAt?: string;
  product: {
    id: string;
    slug: string;
    name: string;
    priceUnit: string;
  };
}

const NEW_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function isLotNew(createdAt?: string): boolean {
  if (!createdAt) return false;
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= NEW_BADGE_WINDOW_MS;
}

interface LotCardProps {
  lot: LotCardLot;
  rate: number;
  /** Sale percentage for `on_sale` status. Computed server-side from product prices. */
  salePercent?: number;
  /** Visual layout — `grid` (default) for catalog cards, `list` for horizontal rows. */
  layout?: "grid" | "list";
}

function statusBadge(status: string, salePercent?: number) {
  switch (status) {
    case "free":
      return { label: "Вільний", className: "bg-green-600 text-white" };
    case "on_sale":
      return {
        label:
          typeof salePercent === "number" && salePercent > 0
            ? `Акція −${salePercent}%`
            : "Акція",
        className: "bg-red-600 text-white",
      };
    case "reserved":
      return { label: "Зарезервований", className: "bg-gray-500 text-white" };
    case "sold":
      return { label: "Продано", className: "bg-gray-400 text-white" };
    default:
      return { label: status, className: "bg-gray-400 text-white" };
  }
}

export function LotCard({
  lot,
  rate,
  salePercent,
  layout = "grid",
}: LotCardProps) {
  const [videoOpen, setVideoOpen] = useState(false);
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const { items, addItem, removeItem } = useCart();

  const cartItem = {
    lotId: lot.id,
    productId: lot.product.id,
    productName: lot.product.name,
    barcode: lot.barcode,
    weight: lot.weight,
    priceEur: lot.priceEur,
    quantity: lot.quantity,
  };
  const key = cartItemKey(cartItem);
  const inCart = items.some((i) => cartItemKey(i) === key);

  const videoId = extractYouTubeId(lot.videoUrl);
  const priceUah = formatUah(eurToUah(lot.priceEur, rate));
  const unitLabel = lot.product.priceUnit === "pair" ? "пар" : "шт";
  const badge = statusBadge(lot.status, salePercent);
  const showNewBadge = isLotNew(lot.createdAt);

  const cardBorder = inCart
    ? "border-2 border-green-500 bg-green-50"
    : lot.status === "on_sale"
      ? "border-2 border-red-300 bg-white"
      : "border bg-white";

  const regularPriceEur =
    typeof salePercent === "number" && salePercent > 0
      ? lot.priceEur / (1 - salePercent / 100)
      : null;

  function handleToggleCart() {
    if (inCart) removeItem(key);
    else addItem(cartItem);
  }

  const badgesOverlay = (
    <>
      <span
        className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}
      >
        {badge.label}
      </span>
      {showNewBadge && (
        <span className="absolute right-2 top-2 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
          NEW
        </span>
      )}
    </>
  );

  const videoBlock = videoId ? (
    <button
      type="button"
      onClick={() => setVideoOpen(true)}
      className={`relative aspect-video overflow-hidden bg-gray-900 ${layout === "list" ? "h-28 w-48 shrink-0 rounded-md" : "w-full"}`}
      aria-label={`Дивитись відеоогляд лоту ${lot.barcode}`}
    >
      <Image
        src={getYouTubeThumbnail(videoId)}
        alt={`Огляд лоту ${lot.barcode}`}
        fill
        sizes={
          layout === "list"
            ? "192px"
            : "(max-width:640px) 100vw, (max-width:1280px) 50vw, 33vw"
        }
        className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
        unoptimized
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full bg-red-600/90 p-2 shadow-lg transition group-hover:bg-red-600">
          <Play
            className={`fill-white text-white ${layout === "list" ? "h-5 w-5" : "h-7 w-7"}`}
            aria-hidden
          />
        </div>
      </div>
      {badgesOverlay}
    </button>
  ) : (
    <div
      className={`relative flex aspect-video items-center justify-center bg-gray-100 text-xs text-gray-400 ${
        layout === "list"
          ? "h-28 w-48 shrink-0 rounded-md border-2 border-dashed border-gray-200"
          : "w-full border-b-2 border-dashed border-gray-200"
      }`}
    >
      <div className="text-center">
        <VideoIcon
          className={`mx-auto mb-1 text-gray-300 ${layout === "list" ? "h-7 w-7" : "h-10 w-10"}`}
          aria-hidden
        />
        Огляд скоро
      </div>
      {badgesOverlay}
    </div>
  );

  const cartButton = (
    <button
      type="button"
      onClick={handleToggleCart}
      data-analytics={inCart ? "remove-from-cart" : "add-to-cart"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
        inCart
          ? "border-2 border-green-600 bg-white text-green-700"
          : "bg-green-600 text-white hover:bg-green-700"
      }`}
      aria-label={
        inCart
          ? `Прибрати лот ${lot.barcode} із замовлення`
          : `Додати лот ${lot.barcode} до замовлення`
      }
    >
      {inCart ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden />У замовленні
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Додати
        </>
      )}
    </button>
  );

  const canQuickOrder = lot.status === "free" || lot.status === "on_sale";

  const quickOrderButton = canQuickOrder ? (
    <button
      type="button"
      onClick={() => setQuickOrderOpen(true)}
      data-analytics="quick-order"
      className="mt-2 w-full rounded-lg border-2 border-amber-500 bg-amber-50 py-2 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
      aria-label={`Купити лот ${lot.barcode} в один клік`}
    >
      ⚡ Купити в один клік
    </button>
  ) : null;

  const quickOrderModal = canQuickOrder ? (
    <QuickOrderModal
      open={quickOrderOpen}
      onOpenChange={setQuickOrderOpen}
      lot={{
        id: lot.id,
        barcode: lot.barcode,
        productId: lot.product.id,
        productName: lot.product.name,
        weight: lot.weight,
        priceEur: lot.priceEur,
        quantity: lot.quantity,
      }}
    />
  ) : null;

  if (layout === "list") {
    return (
      <>
        <div
          className={`group flex gap-4 rounded-lg p-3 transition hover:shadow-md ${cardBorder}`}
        >
          {videoBlock}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-mono text-[10px] text-gray-400">{lot.barcode}</p>
            <Link
              href={`/lot/${encodeURIComponent(lot.barcode)}`}
              className="line-clamp-2 text-sm font-medium hover:text-green-700"
            >
              {lot.product.name}
            </Link>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>
                <strong className="text-gray-900">{lot.weight}</strong> кг
              </span>
              <span>
                <strong className="text-gray-900">{lot.quantity}</strong>{" "}
                {unitLabel}
              </span>
            </div>
            <div className="mt-auto flex items-end justify-between gap-2 pt-1">
              <div className="min-w-0">
                <p className="text-base font-bold text-red-600">{priceUah}</p>
                <p className="text-[11px] text-gray-400">
                  €{lot.priceEur.toFixed(2)}
                  {regularPriceEur !== null && (
                    <>
                      {" "}
                      <span className="line-through">
                        €{regularPriceEur.toFixed(2)}
                      </span>
                    </>
                  )}
                </p>
              </div>
              {cartButton}
            </div>
            {quickOrderButton}
          </div>
        </div>

        <VideoModal
          videoId={videoId}
          open={videoOpen}
          onOpenChange={setVideoOpen}
          title={`Огляд лоту ${lot.barcode}`}
        />
        {quickOrderModal}
      </>
    );
  }

  return (
    <>
      <div
        className={`group overflow-hidden rounded-lg transition hover:shadow-md ${cardBorder}`}
      >
        {videoBlock}

        <div className="p-3">
          <p className="font-mono text-[10px] text-gray-400">{lot.barcode}</p>
          <Link
            href={`/lot/${encodeURIComponent(lot.barcode)}`}
            className="mt-0.5 block line-clamp-2 text-sm font-medium hover:text-green-700"
          >
            {lot.product.name}
          </Link>
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
            <span>
              <strong className="text-gray-900">{lot.weight}</strong> кг
            </span>
            <span>
              <strong className="text-gray-900">{lot.quantity}</strong>{" "}
              {unitLabel}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-bold text-red-600">{priceUah}</p>
              <p className="text-[11px] text-gray-400">
                €{lot.priceEur.toFixed(2)}
                {regularPriceEur !== null && (
                  <>
                    {" "}
                    <span className="line-through">
                      €{regularPriceEur.toFixed(2)}
                    </span>
                  </>
                )}
              </p>
            </div>
            {cartButton}
          </div>
          {quickOrderButton}
        </div>
      </div>

      <VideoModal
        videoId={videoId}
        open={videoOpen}
        onOpenChange={setVideoOpen}
        title={`Огляд лоту ${lot.barcode}`}
      />
      {quickOrderModal}
    </>
  );
}
