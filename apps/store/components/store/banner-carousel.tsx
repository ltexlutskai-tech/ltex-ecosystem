"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

interface Banner {
  id: string;
  imageUrl: string;
  ctaHref: string;
}

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % banners.length);
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
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
      <Link
        href={current.ctaHref}
        className="block h-full w-full"
        data-analytics="banner-click"
      >
        <Image
          src={current.imageUrl}
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1200px"
          className="object-cover transition-opacity duration-500"
        />
      </Link>
    </div>
  );
}
