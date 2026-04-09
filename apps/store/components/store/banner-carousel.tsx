"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % banners.length);
  }, [banners.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + banners.length) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next, banners.length]);

  if (banners.length === 0) return null;

  const current = banners[index];
  if (!current) return null;

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-lg md:h-80 lg:h-96">
      <Image
        src={current.imageUrl}
        alt={current.title}
        fill
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
        className="object-cover transition-opacity duration-500"
      />
      <div className="absolute inset-0 bg-black/30" />

      <div className="absolute inset-0 flex flex-col items-start justify-end p-6 text-white md:p-10">
        <h2 className="text-2xl font-bold md:text-4xl">{current.title}</h2>
        {current.subtitle && (
          <p className="mt-2 max-w-xl text-sm md:text-lg">{current.subtitle}</p>
        )}
        {current.ctaHref && current.ctaLabel && (
          <Link
            href={current.ctaHref}
            className="mt-4 inline-block rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            data-analytics="banner-cta-click"
          >
            {current.ctaLabel}
          </Link>
        )}
      </div>

      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-gray-800 transition-colors hover:bg-white"
            aria-label="Попередній банер"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-gray-800 transition-colors hover:bg-white"
            aria-label="Наступний банер"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/50"
                }`}
                aria-label={`Банер ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
