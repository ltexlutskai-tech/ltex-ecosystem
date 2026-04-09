"use client";

import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/video-reviews";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

interface VideoReviewProduct {
  id: string;
  slug: string;
  name: string;
  videoUrl: string | null;
  prices: { amount: number; currency: string; priceType: string }[];
}

export function VideoReviewsCarousel({
  products,
}: {
  products: VideoReviewProduct[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">{dict.videoReviews.heading}</h2>
        <Link
          href="/catalog"
          className="text-sm font-medium text-primary hover:underline"
          data-analytics="video-reviews-see-all"
        >
          {dict.videoReviews.seeAll}
        </Link>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 scrollbar-thin">
        <div className="flex gap-4">
          {products.map((product) => {
            if (!product.videoUrl) return null;
            const videoId = extractYouTubeId(product.videoUrl);
            if (!videoId) return null;
            const thumb = getYouTubeThumbnail(videoId);
            const wholesalePrice = product.prices.find(
              (p) => p.priceType === "wholesale",
            );
            return (
              <Link
                key={product.id}
                href={`/product/${product.slug}`}
                className="group relative w-64 flex-shrink-0 overflow-hidden rounded-lg border transition-shadow hover:shadow-md"
                data-analytics="video-review-card-click"
                aria-label={dict.videoReviews.watch + ": " + product.name}
              >
                <div className="relative aspect-video bg-gray-100">
                  <Image
                    src={thumb}
                    alt={product.name}
                    fill
                    sizes="256px"
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
                      <Play className="h-6 w-6 fill-white" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-medium">
                    {product.name}
                  </h3>
                  {wholesalePrice && (
                    <p className="mt-1 text-sm font-bold text-green-700">
                      €{wholesalePrice.amount.toFixed(2)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
