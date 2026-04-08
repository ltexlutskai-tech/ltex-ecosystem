"use client";

import Link from "next/link";
import { Card, CardContent, Badge } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import { useRecentlyViewed } from "@/lib/recently-viewed";

export function RecentlyViewedSection() {
  const { items } = useRecentlyViewed();

  if (items.length === 0) return null;

  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <h2 className="text-xl font-bold">Нещодавно переглянуті</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.slice(0, 6).map((item) => (
            <Link key={item.slug} href={`/product/${item.slug}`}>
              <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
                <div className="aspect-[4/3] bg-gray-100">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      Немає фото
                    </div>
                  )}
                </div>
                <CardContent className="p-2">
                  <h3 className="line-clamp-1 text-xs font-medium">
                    {item.name}
                  </h3>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {QUALITY_LABELS[item.quality as QualityLevel] ??
                      item.quality}
                  </Badge>
                  {item.priceEur !== null && (
                    <p className="mt-1 text-sm font-bold text-green-700">
                      €{item.priceEur.toFixed(2)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
