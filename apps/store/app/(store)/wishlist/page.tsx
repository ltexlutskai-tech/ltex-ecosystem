"use client";

import Link from "next/link";
import { Button, Card, CardContent, Badge } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import {
  useWishlist,
  wishlistItemKey,
  type WishlistItem,
} from "@/lib/wishlist";
import { Heart, Trash2, Play } from "lucide-react";
import { getDictionary } from "@/lib/i18n";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/youtube";

const dict = getDictionary();

export default function WishlistPage() {
  const { items, removeItem } = useWishlist();

  if (items.length === 0) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
        <Heart className="h-12 w-12 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold">{dict.wishlist.empty}</h1>
        <p className="mt-2 text-gray-500">{dict.wishlist.addHint}</p>
        <Button className="mt-6" asChild>
          <Link href="/catalog">{dict.cart.toCatalog}</Link>
        </Button>
      </div>
    );
  }

  const products = items.filter((i) => i.kind === "product");
  const lots = items.filter((i) => i.kind === "lot");

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">
        {dict.wishlist.title} ({items.length})
      </h1>

      {products.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Збережені товари ({products.length})
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((item) => (
              <ProductWishlistCard
                key={wishlistItemKey(item)}
                item={item}
                onRemove={() => removeItem(wishlistItemKey(item))}
              />
            ))}
          </div>
        </section>
      )}

      {lots.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Збережені лоти ({lots.length})
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {lots.map((item) => (
              <LotWishlistCard
                key={wishlistItemKey(item)}
                item={item}
                onRemove={() => removeItem(wishlistItemKey(item))}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProductWishlistCard({
  item,
  onRemove,
}: {
  item: WishlistItem;
  onRemove: () => void;
}) {
  return (
    <div className="group relative">
      <Link href={`/product/${item.slug}`}>
        <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
          <div className="aspect-[4/3] bg-gray-100">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                {dict.catalog.noPhoto}
              </div>
            )}
          </div>
          <CardContent className="p-3">
            <h3 className="line-clamp-2 text-sm font-medium">{item.name}</h3>
            <Badge variant="outline" className="mt-1 text-xs">
              {QUALITY_LABELS[item.quality as QualityLevel] ?? item.quality}
            </Badge>
            {item.priceEur !== null && (
              <p className="mt-2 text-lg font-bold text-green-700">
                €{item.priceEur.toFixed(2)}
                <span className="text-xs font-normal text-gray-500">
                  /{item.priceUnit === "kg" ? "кг" : "шт"}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-red-500 shadow-md hover:bg-white"
        aria-label={`Видалити ${item.name} з обраного`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function LotWishlistCard({
  item,
  onRemove,
}: {
  item: WishlistItem;
  onRemove: () => void;
}) {
  const videoId = extractYouTubeId(item.videoUrl ?? null);
  const href = item.barcode
    ? `/lot/${encodeURIComponent(item.barcode)}`
    : `/product/${item.slug}`;

  return (
    <div className="group relative">
      <Link href={href}>
        <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
          <div className="relative aspect-video bg-gray-900">
            {videoId ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getYouTubeThumbnail(videoId)}
                  alt={`Огляд лоту ${item.barcode ?? ""}`}
                  className="h-full w-full object-cover opacity-90"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full bg-red-600/90 p-2 shadow-lg">
                    <Play
                      className="h-5 w-5 fill-white text-white"
                      aria-hidden
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-300">
                Огляд скоро
              </div>
            )}
          </div>
          <CardContent className="p-3">
            {item.barcode && (
              <p className="font-mono text-[10px] text-gray-400">
                {item.barcode}
              </p>
            )}
            <h3 className="mt-0.5 line-clamp-2 text-sm font-medium">
              {item.name}
            </h3>
            {(item.weight !== undefined || item.quantity !== undefined) && (
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                {item.weight !== undefined && (
                  <span>
                    <strong className="text-gray-900">{item.weight}</strong> кг
                  </span>
                )}
                {item.quantity !== undefined && (
                  <span>
                    <strong className="text-gray-900">{item.quantity}</strong>{" "}
                    {item.priceUnit === "pair" ? "пар" : "шт"}
                  </span>
                )}
              </div>
            )}
            {item.priceEur !== null && (
              <p className="mt-2 text-lg font-bold text-green-700">
                €{item.priceEur.toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-red-500 shadow-md hover:bg-white"
        aria-label={`Видалити лот ${item.barcode ?? item.name} з обраного`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
