"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Badge,
  Button,
} from "@ltex/ui";
import {
  QUALITY_LABELS,
  SEASON_LABELS,
  type QualityLevel,
} from "@ltex/shared";
import { Eye } from "lucide-react";
import Link from "next/link";

interface QuickViewProduct {
  slug: string;
  name: string;
  quality: string;
  season: string;
  priceUnit: string;
  country: string;
  videoUrl: string | null;
  images: { url: string; alt: string }[];
  _count: { lots: number };
  prices: { amount: number; currency: string; priceType: string }[];
}

export function QuickViewButton({ product }: { product: QuickViewProduct }) {
  const [open, setOpen] = useState(false);
  const wholesalePrice = product.prices.find(
    (p) => p.priceType === "wholesale",
  );
  const firstImage = product.images[0];

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute bottom-2 right-2 rounded-full bg-white/90 p-2 opacity-0 shadow-md transition-opacity group-hover:opacity-100 hover:bg-white"
        aria-label={`Швидкий перегляд: ${product.name}`}
      >
        <Eye className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">{product.name}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
              {firstImage ? (
                <img
                  src={firstImage.url}
                  alt={firstImage.alt || product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  Немає фото
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">
                  {QUALITY_LABELS[product.quality as QualityLevel] ??
                    product.quality}
                </Badge>
                {product.season && (
                  <Badge variant="outline">
                    {SEASON_LABELS[product.season] ?? product.season}
                  </Badge>
                )}
              </div>

              {wholesalePrice && (
                <p className="text-2xl font-bold text-green-700">
                  €{wholesalePrice.amount.toFixed(2)}
                  <span className="text-sm font-normal text-gray-500">
                    /{product.priceUnit === "kg" ? "кг" : "шт"}
                  </span>
                </p>
              )}

              <p className="text-sm text-gray-500">
                {product._count.lots > 0
                  ? `${product._count.lots} доступних лотів`
                  : "Немає доступних лотів"}
              </p>

              <Button asChild className="w-full">
                <Link
                  href={`/product/${product.slug}`}
                  onClick={() => setOpen(false)}
                >
                  Детальніше
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
