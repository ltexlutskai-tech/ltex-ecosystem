import type { Metadata } from "next";
import { cache, Suspense } from "react";
import dynamic from "next/dynamic";
import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import {
  QUALITY_LABELS,
  SEASON_LABELS,
  COUNTRY_LABELS,
  type QualityLevel,
} from "@ltex/shared";
import { Package, Truck, Clock, Scale } from "lucide-react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ProductJsonLd } from "@/components/store/product-json-ld";
import { ProductCard } from "@/components/store/product-card";
import { ShareIcons } from "@/components/store/share-icons";
import { TrustBadge } from "@/components/store/trust-badge";
import { LotReviews } from "@/components/store/lot-reviews";
import { RecentReviewsCarousel } from "@/components/store/recent-reviews-carousel";
import { AddProductToCartButton } from "@/components/store/add-product-to-cart-button";
import { WishlistButton } from "@/components/store/wishlist-button";
import {
  getRecommendations,
  getFrequentlyBoughtTogether,
} from "@/lib/recommendations";
import { TrackProductView } from "@/components/store/track-product-view";
import { getDictionary } from "@/lib/i18n";
import { getCurrentRate, eurToUah, formatUah } from "@/lib/exchange-rate";

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

const getProduct = cache(async (slug: string) => {
  return prisma.product.findUnique({
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
});

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const description = `${product.name} гуртом. Якість: ${
    QUALITY_LABELS[product.quality as QualityLevel] ?? product.quality
  }. ${
    product.description ||
    "Секонд хенд, сток, іграшки та Bric-a-Brac від L-TEX."
  }`;
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

interface KeyFact {
  label: string;
  value: string | null;
}

function buildKeyFacts(
  product: Awaited<ReturnType<typeof getProduct>>,
): KeyFact[] {
  if (!product) return [];
  const seasonLabel =
    product.season && product.season !== ""
      ? (SEASON_LABELS[product.season] ?? null)
      : null;
  const qualityLabel =
    QUALITY_LABELS[product.quality as QualityLevel] ?? product.quality ?? null;
  const countryLabel =
    COUNTRY_LABELS[product.country as keyof typeof COUNTRY_LABELS] ??
    product.country ??
    null;
  const avgWeight = product.averageWeight
    ? `${product.averageWeight} кг`
    : null;

  return [
    { label: "Сезон", value: seasonLabel },
    { label: "Сорт", value: qualityLabel },
    { label: "Стать", value: product.gender ?? null },
    { label: "Розміри", value: product.sizes ?? null },
    { label: "Країна", value: countryLabel },
    { label: "К-сть одиниць", value: product.unitsPerKg ?? null },
    { label: "Вага одиниці", value: product.unitWeight ?? null },
    { label: "Вага лота", value: avgWeight },
  ];
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const wholesalePrice = product.prices.find(
    (p) => p.priceType === "wholesale",
  );
  const salePrice = product.prices.find((p) => p.priceType === "akciya");
  const displayPrice = salePrice?.amount ?? wholesalePrice?.amount ?? null;
  const regularPrice =
    salePrice && wholesalePrice ? wholesalePrice.amount : null;
  const hasSale = Boolean(salePrice && wholesalePrice);
  const discountPercent =
    hasSale && wholesalePrice && salePrice
      ? Math.round(
          ((wholesalePrice.amount - salePrice.amount) / wholesalePrice.amount) *
            100,
        )
      : 0;

  const priceUnitLabel = product.priceUnit === "kg" ? "кг" : "шт";

  const rate = await getCurrentRate();
  const priceUah =
    displayPrice !== null ? formatUah(eurToUah(displayPrice, rate)) : null;

  const keyFacts = buildKeyFacts(product).filter((f) => f.value);

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

  const productUrl = `${SITE_URL}/product/${product.slug}`;
  const heroImage = product.images[0]?.url ?? null;

  return (
    <div className="container mx-auto px-4 py-6">
      <TrackProductView
        id={product.id}
        slug={product.slug}
        name={product.name}
        quality={product.quality}
        imageUrl={heroImage}
        priceEur={wholesalePrice?.amount ?? null}
        priceUnit={product.priceUnit}
      />
      <ProductJsonLd
        product={product}
        price={displayPrice ?? undefined}
        currency={salePrice?.currency ?? wholesalePrice?.currency ?? "EUR"}
      />
      <Breadcrumbs items={breadcrumbs} />

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* LEFT: Gallery + Trust badge (sticky on lg) */}
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          {product.images.length > 0 ? (
            <ImageGallery
              images={product.images.map((img) => ({
                url: img.url,
                alt: img.alt || product.name,
              }))}
              productName={product.name}
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border bg-gray-100 text-gray-400">
              {dict.product.noPhoto}
            </div>
          )}
          <TrustBadge />
        </div>

        {/* RIGHT: Details */}
        <div className="space-y-5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold leading-tight lg:text-3xl">
                {product.name}
              </h1>
              {product.articleCode && (
                <p className="mt-1 text-sm text-gray-500">
                  {dict.product.article}:{" "}
                  <span className="font-mono">{product.articleCode}</span>
                </p>
              )}
            </div>
            <div className="shrink-0">
              <WishlistButton
                product={{
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  quality: product.quality,
                  imageUrl: heroImage,
                  priceEur: displayPrice,
                  priceUnit: product.priceUnit,
                }}
                size="md"
              />
            </div>
          </div>

          {/* Price */}
          {displayPrice !== null && (
            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className={`text-4xl font-bold ${hasSale ? "text-red-600" : "text-green-700"}`}
              >
                €{displayPrice.toFixed(2)}
              </span>
              {regularPrice !== null && (
                <span className="text-lg text-gray-400 line-through">
                  €{regularPrice.toFixed(2)}
                </span>
              )}
              <span className="text-base text-gray-500">
                / {priceUnitLabel}
              </span>
              {priceUah && (
                <span className="text-sm text-gray-400">
                  ≈ {priceUah}/{priceUnitLabel}
                </span>
              )}
              {hasSale && discountPercent > 0 && (
                <span className="rounded bg-red-600 px-2 py-1 text-xs font-bold text-white">
                  SALE −{discountPercent}%
                </span>
              )}
            </div>
          )}

          {/* Stock indicator */}
          {product.inStock ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-green-600" />
              <span className="font-medium text-green-700">В наявності</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-medium text-amber-700">
                Очікуємо надходження
              </span>
            </div>
          )}

          {/* Key facts checklist */}
          {keyFacts.length > 0 && (
            <div className="rounded-lg border bg-white p-4">
              <ul className="space-y-2 text-sm">
                {keyFacts.map((fact) => (
                  <li key={fact.label} className="flex gap-2">
                    <span
                      className="shrink-0 font-bold text-green-600"
                      aria-hidden
                    >
                      ✔
                    </span>
                    <span className="w-32 shrink-0 text-gray-500">
                      {fact.label}:
                    </span>
                    <span className="font-medium">{fact.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA buttons */}
          {displayPrice !== null && (
            <div className="flex gap-3">
              <AddProductToCartButton
                productId={product.id}
                productName={product.name}
                priceEur={displayPrice}
                weight={product.averageWeight ?? 25}
              />
              <WishlistButton
                product={{
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  quality: product.quality,
                  imageUrl: heroImage,
                  priceEur: displayPrice,
                  priceUnit: product.priceUnit,
                }}
                size="md"
              />
            </div>
          )}
          <p className="-mt-2 text-xs text-gray-500">
            Замовлення обробляє менеджер. Передоплата не потрібна — ми
            зв&apos;яжемося для підтвердження.
          </p>

          <ShareIcons url={productUrl} title={product.name} />
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <section className="mt-10 rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-xl font-bold">{dict.product.description}</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">
            {product.description}
          </p>
        </section>
      )}

      {/* Lot reviews (replaces "Доступні лоти") */}
      <LotReviews
        lots={product.lots.map((lot) => ({
          id: lot.id,
          barcode: lot.barcode,
          weight: lot.weight,
          quantity: lot.quantity,
          priceEur: lot.priceEur,
          videoUrl: lot.videoUrl,
          status: lot.status,
        }))}
        productId={product.id}
        productName={product.name}
        rate={rate}
      />

      {/* Recent video reviews carousel */}
      <Suspense fallback={null}>
        <RecentReviewsCarousel currentProductId={product.id} />
      </Suspense>

      {/* Delivery info */}
      <section className="mt-10 rounded-lg border bg-muted/30 p-6">
        <h2 className="mb-4 text-xl font-bold">{dict.delivery.title}</h2>
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div className="flex gap-3">
            <Truck
              className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
              aria-hidden
            />
            <div>
              <p className="font-medium">Нова Пошта</p>
              <p className="text-gray-600">По всій Україні — 1–3 робочих дні</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Package
              className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
              aria-hidden
            />
            <div>
              <p className="font-medium">Власна доставка</p>
              <p className="text-gray-600">
                По Волинській області, Луцький район
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock
              className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
              aria-hidden
            />
            <div>
              <p className="font-medium">Швидка відправка</p>
              <p className="text-gray-600">
                У день замовлення або наступного дня
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Scale
              className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
              aria-hidden
            />
            <div>
              <p className="font-medium">Мінімальне замовлення</p>
              <p className="text-gray-600">від 10 кг</p>
            </div>
          </div>
        </div>
      </section>

      {/* Recommendations — streamed separately */}
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
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
