"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, Video as VideoIcon } from "lucide-react";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { VideoModal } from "@/components/store/video-modal";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/youtube";
import { formatUah, eurToUah } from "@/lib/exchange-rate";

export interface LotReviewCardData {
  id: string;
  barcode: string;
  weight: number;
  quantity: number;
  priceEur: number;
  videoUrl: string | null;
  status: string;
}

interface LotReviewCardProps {
  lot: LotReviewCardData;
  productId: string;
  productName: string;
  rate: number;
}

export function LotReviewCard({
  lot,
  productId,
  productName,
  rate,
}: LotReviewCardProps) {
  const videoId = extractYouTubeId(lot.videoUrl);
  const priceUah = formatUah(eurToUah(lot.priceEur, rate));
  const [videoOpen, setVideoOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-white p-3 lg:flex-row lg:p-4">
      {videoId ? (
        <>
          <button
            type="button"
            onClick={() => setVideoOpen(true)}
            className="group relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-gray-900 lg:w-60"
            aria-label={`Відеоогляд лоту ${lot.barcode}`}
          >
            <Image
              src={getYouTubeThumbnail(videoId)}
              alt={`Огляд лоту ${lot.barcode}`}
              fill
              sizes="(max-width:1024px) 100vw, 240px"
              className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
              unoptimized
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-red-600/90 p-3 transition group-hover:bg-red-600">
                <Play className="h-6 w-6 fill-white text-white" />
              </div>
            </div>
          </button>
          <VideoModal
            videoId={videoId}
            open={videoOpen}
            onOpenChange={setVideoOpen}
            title={`Огляд лоту ${lot.barcode}`}
          />
        </>
      ) : (
        <div className="flex aspect-video w-full shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-100 text-xs text-gray-400 lg:w-60">
          <div className="text-center">
            <VideoIcon
              className="mx-auto mb-1 h-8 w-8 text-gray-300"
              aria-hidden
            />
            Огляд скоро
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-gray-500">
            Штрихкод: {lot.barcode}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-gray-500">Вага:</span>{" "}
              <strong>{lot.weight} кг</strong>
            </span>
            <span>
              <span className="text-gray-500">К-сть:</span>{" "}
              <strong>{lot.quantity} шт</strong>
            </span>
            <span>
              <span className="text-gray-500">Ціна:</span>{" "}
              <strong className="text-red-600">{priceUah}</strong>{" "}
              <span className="text-xs text-gray-400">
                (€{lot.priceEur.toFixed(2)})
              </span>
            </span>
          </div>
        </div>
        <AddToCartButton
          lot={{
            lotId: lot.id,
            productId,
            productName,
            barcode: lot.barcode,
            weight: lot.weight,
            priceEur: lot.priceEur,
            quantity: lot.quantity,
          }}
        />
      </div>
    </div>
  );
}
