"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@ltex/ui";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

interface GalleryImage {
  url: string;
  alt: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  productName: string;
}

export function ImageGallery({ images, productName }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const goTo = useCallback(
    (index: number) => {
      setSelectedIndex(
        ((index % images.length) + images.length) % images.length,
      );
    },
    [images.length],
  );

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-gray-100 text-gray-400">
        Немає фото
      </div>
    );
  }

  const currentImage = images[selectedIndex]!;

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div
        className="group relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-lg border bg-gray-100"
        onClick={() => setLightboxOpen(true)}
      >
        <Image
          src={currentImage.url}
          alt={currentImage.alt || productName}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority={selectedIndex === 0}
          className="object-cover transition-transform group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
          <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-80" />
        </div>
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goTo(selectedIndex - 1);
              }}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-1.5 shadow-md hover:bg-white"
              aria-label="Попереднє фото"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goTo(selectedIndex + 1);
              }}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/80 p-1.5 shadow-md hover:bg-white"
              aria-label="Наступне фото"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelectedIndex(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                i === selectedIndex
                  ? "border-green-500"
                  : "border-transparent hover:border-gray-300"
              }`}
            >
              <Image
                src={img.url}
                alt={img.alt || `${productName} ${i + 1}`}
                fill
                sizes="64px"
                loading="lazy"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-h-[95vh] max-w-4xl border-0 bg-black/95 p-0">
          <div className="relative h-[90vh] w-full">
            <Image
              src={currentImage.url}
              alt={currentImage.alt || productName}
              fill
              sizes="100vw"
              quality={90}
              className="object-contain"
            />
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 z-20 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            >
              <X className="h-5 w-5" />
            </button>
            {images.length > 1 && (
              <>
                <button
                  onClick={() => goTo(selectedIndex - 1)}
                  className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => goTo(selectedIndex + 1)}
                  className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
              {selectedIndex + 1} / {images.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
