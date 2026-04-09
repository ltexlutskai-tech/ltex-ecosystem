import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { Badge } from "@ltex/ui";
import {
  QUALITY_LABELS,
  SEASON_LABELS,
  COUNTRY_LABELS,
  PRICE_UNIT_LABELS,
  LOT_STATUS_LABELS,
  type QualityLevel,
  type LotStatus,
} from "@ltex/shared";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { ProductJsonLd } from "@/components/store/product-json-ld";
import { ProductCard } from "@/components/store/product-card";
import {
  getRecommendations,
  getFrequentlyBoughtTogether,
} from "@/lib/recommendations";
import { TrackProductView } from "@/components/store/track-product-view";
import { getDictionary } from "@/lib/i18n";

const ImageGallery = dynamic(
  () => import("@/components/store/image-gallery").then((m) => m.ImageGallery),
  {
    loading: () => (
      <div className="aspect-[4/3] animate-pulse rounded-lg bg-gray-200" />
    ),
  },
);

const dict = getDictionary();

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: true,
      images: { take: 1, orderBy: { position: "asc" } },
    },
  });
  if (!product) return {};
  const description = `${product.name} гуртом. Якість: ${QUALITY_LABELS[product.quality as QualityLevel] ?? product.quality}. ${product.description || "Секонд хенд та сток від L-TEX."}`;
  const imageUrl = product.images[0]?.url;
  return {
    title: `${product.name} — ${product.category.name}`,
    description,
    alternates: {
      canonical: `${SITE_URL}/product/${slug}`,
    },
    openGraph: {
      title: product.name,
      description,
      url: `${SITE_URL}/product/${slug}`,
      ...(imageUrl && { images: [{ url: imageUrl, alt: product.name }] }),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: { include: { parent: true } },
      images: { orderBy: { position: "asc" } },
      prices: true,
      lots: {
        where: { status: { in: ["free", "on_sale"] } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!product) notFound();

  const wholesalePrice = product.prices.find(
    (p) => p.priceType === "wholesale",
  );
  const salePrice = product.prices.find((p) => p.priceType === "akciya");

  const breadcrumbs = [
    { label: "Каталог", href: "/catalog" },
    ...(product.category.parent
      ? [
          {
            label: product.category.parent.name,
            href: `/catalog/${product.category.parent.slug}`,
          },
          {
            label: product.category.name,
            href: `/catalog/${product.category.parent.slug}/${product.category.slug}`,
          },
        ]
      : [
          {
            label: product.category.name,
            href: `/catalog/${product.category.slug}`,
          },
        ]),
    { label: product.name },
  ];

  // Extract YouTube embed URL
  let youtubeEmbed: string | null = null;
  if (product.videoUrl) {
    const match = product.videoUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
    );
    if (match?.[1]) {
      youtubeEmbed = `https://www.youtube.com/embed/${match[1]}`;
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <TrackProductView
        slug={product.slug}
        name={product.name}
        quality={product.quality}
        imageUrl={product.images[0]?.url ?? null}
        priceEur={wholesalePrice?.amount ?? null}
        priceUnit={product.priceUnit}
      />
      <ProductJsonLd
        product={product}
        price={wholesalePrice?.amount}
        currency={wholesalePrice?.currency ?? "EUR"}
      />
      <Breadcrumbs items={breadcrumbs} />

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Images */}
        <div className="space-y-3">
          {product.images.length > 0 ? (
            <ImageGallery
              images={product.images.map((img) => ({
                url: img.url,
                alt: img.alt || product.name,
              }))}
              productName={product.name}
            />
          ) : youtubeEmbed ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border">
              <iframe
                src={youtubeEmbed}
                title={product.name}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-gray-100 text-gray-400">
              {dict.product.noPhoto}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold lg:text-3xl">{product.name}</h1>
            {product.articleCode && (
              <p className="mt-1 text-sm text-gray-500">
                {dict.product.article}: {product.articleCode}
              </p>
            )}
          </div>

          {/* Prices */}
          <div className="flex items-baseline gap-3">
            {salePrice && (
              <span className="text-2xl font-bold text-red-600">
                €{salePrice.amount.toFixed(2)}
                <span className="text-sm font-normal">
                  /
                  {PRICE_UNIT_LABELS[
                    product.priceUnit as keyof typeof PRICE_UNIT_LABELS
                  ]?.replace("€/", "") ?? product.priceUnit}
                </span>
              </span>
            )}
            {wholesalePrice && (
              <span
                className={`text-2xl font-bold ${salePrice ? "text-gray-400 line-through" : "text-green-700"}`}
              >
                €{wholesalePrice.amount.toFixed(2)}
                {!salePrice && (
                  <span className="text-sm font-normal text-gray-500">
                    /{product.priceUnit === "kg" ? "кг" : "шт"}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Attributes */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">{dict.product.quality}</span>
              <p className="font-medium">
                {QUALITY_LABELS[product.quality as QualityLevel] ??
                  product.quality}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">{dict.product.season}</span>
              <p className="font-medium">
                {SEASON_LABELS[product.season] ?? dict.product.allSeason}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">{dict.product.country}</span>
              <p className="font-medium">
                {COUNTRY_LABELS[
                  product.country as keyof typeof COUNTRY_LABELS
                ] ?? product.country}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">{dict.product.priceUnit}</span>
              <p className="font-medium">
                {PRICE_UNIT_LABELS[
                  product.priceUnit as keyof typeof PRICE_UNIT_LABELS
                ] ?? product.priceUnit}
              </p>
            </div>
            {product.averageWeight && (
              <div className="rounded-lg border p-3">
                <span className="text-gray-500">{dict.product.avgWeight}</span>
                <p className="font-medium">{product.averageWeight} кг</p>
              </div>
            )}
          </div>

          {product.description && (
            <div>
              <h2 className="font-semibold">{dict.product.description}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {product.description}
              </p>
            </div>
          )}

          {/* Video link */}
          {product.videoUrl && !youtubeEmbed && (
            <a
              href={product.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-green-700 underline"
            >
              {dict.product.watchVideo}
            </a>
          )}
          {product.images.length > 0 && youtubeEmbed && (
            <div className="aspect-video w-full overflow-hidden rounded-lg border">
              <iframe
                src={youtubeEmbed}
                title={product.name}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      </div>

      {/* Lots table */}
      {product.lots.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold">
            {dict.product.availableLots} ({product.lots.length})
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">
                    {dict.product.barcode}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {dict.product.weight}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {dict.product.quantity}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {dict.product.priceEur}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {dict.product.status}
                  </th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {product.lots.map((lot) => (
                  <tr key={lot.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      {lot.barcode}
                    </td>
                    <td className="px-4 py-3">{lot.weight} кг</td>
                    <td className="px-4 py-3">{lot.quantity}</td>
                    <td className="px-4 py-3 font-medium">
                      €{lot.priceEur.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          lot.status === "on_sale" ? "accent" : "secondary"
                        }
                      >
                        {LOT_STATUS_LABELS[lot.status as LotStatus] ??
                          lot.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {lot.status === "free" && (
                        <AddToCartButton
                          lot={{
                            lotId: lot.id,
                            productId: product.id,
                            productName: product.name,
                            barcode: lot.barcode,
                            weight: lot.weight,
                            priceEur: lot.priceEur,
                            quantity: lot.quantity,
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommendations — streamed separately so the product detail renders
          immediately without waiting on the similar/bought-together queries. */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <RecommendationsSection productId={product.id} />
      </Suspense>
    </div>
  );
}

function RecommendationsSkeleton() {
  return (
    <div className="mt-10">
      <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] animate-pulse rounded-lg bg-gray-200"
          />
        ))}
      </div>
    </div>
  );
}

async function RecommendationsSection({ productId }: { productId: string }) {
  const [similar, boughtTogether] = await Promise.all([
    getRecommendations(productId, 6),
    getFrequentlyBoughtTogether(productId, 4),
  ]);

  if (similar.length === 0 && boughtTogether.length === 0) return null;

  return (
    <>
      {similar.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold">{dict.product.similar}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            {similar.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {boughtTogether.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold">{dict.product.boughtTogether}</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {boughtTogether.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
