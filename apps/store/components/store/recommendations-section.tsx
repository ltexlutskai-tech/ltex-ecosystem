"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, Badge } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import { useRecentlyViewed } from "@/lib/recently-viewed";

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  quality: string;
  priceUnit: string;
  images: { url: string; alt: string }[];
  prices: { amount: number; currency: string; priceType: string }[];
}

const SEEN_LIMIT = 20;

export function RecommendationsSection() {
  const { items } = useRecentlyViewed();
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const seenIds = items
      .map((i) => i.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, SEEN_LIMIT);
    const url = `/api/recommendations${seenIds.length > 0 ? `?seen=${seenIds.join(",")}` : ""}`;

    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  if (loading || products.length === 0) return null;

  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <h2 className="text-xl font-bold">Рекомендоване для вас</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {products.slice(0, 12).map((p) => {
            const wholesalePrice = p.prices.find(
              (pr) => pr.priceType === "wholesale",
            );
            const akciyaPrice = p.prices.find(
              (pr) => pr.priceType === "akciya",
            );
            const displayPrice = akciyaPrice?.amount ?? wholesalePrice?.amount;

            return (
              <Link key={p.id} href={`/product/${p.slug}`}>
                <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="aspect-[4/3] bg-gray-100">
                    {p.images[0] ? (
                      <img
                        src={p.images[0].url}
                        alt={p.images[0].alt || p.name}
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
                      {p.name}
                    </h3>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality}
                    </Badge>
                    {displayPrice !== undefined && (
                      <div className="mt-1 text-xs font-bold">
                        €{displayPrice.toFixed(2)}/{p.priceUnit}
                        {akciyaPrice && wholesalePrice && (
                          <span className="ml-1 font-normal text-gray-400 line-through">
                            €{wholesalePrice.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
