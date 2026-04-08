"use client";

import Link from "next/link";
import { Button, Card, CardContent, Badge } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import { useWishlist } from "@/lib/wishlist";
import { Heart, Trash2 } from "lucide-react";

export default function WishlistPage() {
  const { items, removeItem } = useWishlist();

  if (items.length === 0) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-16 text-center">
        <Heart className="h-12 w-12 text-gray-300" />
        <h1 className="mt-4 text-2xl font-bold">Список обраного порожній</h1>
        <p className="mt-2 text-gray-500">
          Натисніть на серце на картці товару, щоб додати його сюди
        </p>
        <Button className="mt-6" asChild>
          <Link href="/catalog">До каталогу</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold">
        Обране ({items.length})
      </h1>

      <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.productId} className="group relative">
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
                      Немає фото
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <h3 className="line-clamp-2 text-sm font-medium">
                    {item.name}
                  </h3>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {QUALITY_LABELS[item.quality as QualityLevel] ??
                      item.quality}
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
              onClick={() => removeItem(item.productId)}
              className="absolute right-2 top-2 rounded-full bg-white/90 p-2 text-red-500 shadow-md hover:bg-white"
              aria-label={`Видалити ${item.name} з обраного`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
