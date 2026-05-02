import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { prisma } from "@ltex/db";
import { extractYouTubeId, getYouTubeThumbnail } from "@/lib/youtube";

const PLAYLIST_URL =
  process.env.NEXT_PUBLIC_YOUTUBE_PLAYLIST_URL ??
  "https://www.youtube.com/@LTEX";

interface Props {
  currentProductId: string;
  limit?: number;
}

export async function RecentReviewsCarousel({
  currentProductId,
  limit = 12,
}: Props) {
  const products = await prisma.product.findMany({
    where: {
      videoUrl: { not: null },
      inStock: true,
      NOT: { id: currentProductId },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      videoUrl: true,
    },
  });

  const cards = products
    .map((p) => ({ ...p, videoId: extractYouTubeId(p.videoUrl) }))
    .filter((p): p is typeof p & { videoId: string } => Boolean(p.videoId));

  if (cards.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Останні відеоогляди</h2>
        <a
          href={PLAYLIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-green-700 hover:underline"
        >
          Усі огляди на YouTube
          <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>

      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {cards.map((p) => (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className="group w-64 shrink-0 cursor-pointer"
            data-analytics="recent-review-card-click"
          >
            <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-900">
              <Image
                src={getYouTubeThumbnail(p.videoId)}
                alt={p.name}
                fill
                sizes="256px"
                className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
                unoptimized
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full bg-red-600/90 p-2 transition group-hover:bg-red-600">
                  <Play className="h-5 w-5 fill-white text-white" />
                </div>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-medium group-hover:text-green-700">
              {p.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
