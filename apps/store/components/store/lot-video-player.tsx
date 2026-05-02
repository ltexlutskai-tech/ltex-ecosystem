"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";
import { getYouTubeThumbnail } from "@/lib/youtube";

interface LotVideoPlayerProps {
  videoId: string;
  barcode: string;
}

export function LotVideoPlayer({ videoId, barcode }: LotVideoPlayerProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-gray-900">
      {playing ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          title={`Огляд лоту ${barcode}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full"
          aria-label={`Відтворити відеоогляд лоту ${barcode}`}
        >
          <Image
            src={getYouTubeThumbnail(videoId)}
            alt={`Огляд лоту ${barcode}`}
            fill
            sizes="(max-width:1024px) 100vw, 50vw"
            className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
            unoptimized
            priority
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-red-600/90 p-5 shadow-xl transition group-hover:bg-red-600">
              <Play className="h-10 w-10 fill-white text-white" aria-hidden />
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
