import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import {
  QUALITY_LABELS,
  SEASON_LABELS,
  COUNTRY_LABELS,
  LOT_STATUS_LABELS,
  type QualityLevel,
  type LotStatus,
  type Country,
} from "@ltex/shared";
import { Truck, Package, Clock, Scale, ShoppingCart, Info } from "lucide-react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { LotCard } from "@/components/store/lot-card";
import { LotVideoPlayer } from "@/components/store/lot-video-player";
import { ShareIcons } from "@/components/store/share-icons";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { extractYouTubeId } from "@/lib/youtube";
import { getCurrentRate, eurToUah, formatUah } from "@/lib/exchange-rate";

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

const getLot = cache(async (barcode: string) => {
  return prisma.lot.findUnique({
    where: { barcode },
    include: {
      product: {
        include: {
          category: { select: { id: true, slug: true, name: true } },
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
          prices: { select: { priceType: true, amount: true } },
        },
      },
    },
  });
});

interface Props {
  params: Promise<{ barcode: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { barcode } = await params;
  const decodedBarcode = decodeURIComponent(barcode);
  const lot = await getLot(decodedBarcode);
  if (!lot) return {};
  const unitLabel = lot.product.priceUnit === "pair" ? "пар" : "шт";
  const description = `Лот ${decodedBarcode}: ${lot.product.name}, ${lot.weight} кг, ${lot.quantity} ${unitLabel}. ${lot.product.description.slice(0, 120)}`;
  return {
    title: `Лот ${decodedBarcode} — ${lot.product.name}`,
    description,
    alternates: {
      canonical: `${SITE_URL}/lot/${encodeURIComponent(decodedBarcode)}`,
    },
    openGraph: {
      title: `Лот ${decodedBarcode} — ${lot.product.name}`,
      description,
      url: `${SITE_URL}/lot/${encodeURIComponent(decodedBarcode)}`,
    },
  };
}

function computeSalePercent(
  prices: { priceType: string; amount: number }[],
): number | undefined {
  const wholesale = prices.find((p) => p.priceType === "wholesale")?.amount;
  const akciya = prices.find((p) => p.priceType === "akciya")?.amount;
  if (!wholesale || !akciya || wholesale <= 0 || akciya >= wholesale) {
    return undefined;
  }
  return Math.round(((wholesale - akciya) / wholesale) * 100);
}

interface KeyFact {
  label: string;
  value: string | null;
  href?: string;
}

export default async function LotDetailPage({ params }: Props) {
  const { barcode: rawBarcode } = await params;
  const barcode = decodeURIComponent(rawBarcode);
  const lot = await getLot(barcode);
  if (!lot) notFound();

  const rate = await getCurrentRate();
  const videoId = extractYouTubeId(lot.videoUrl);
  const heroImage = lot.product.images[0]?.url ?? null;
  const unitLabel = lot.product.priceUnit === "pair" ? "пар" : "шт";
  const salePercent =
    lot.status === "on_sale"
      ? computeSalePercent(lot.product.prices)
      : undefined;
  const priceUah = formatUah(eurToUah(lot.priceEur, rate));
  const regularPriceEur =
    typeof salePercent === "number" && salePercent > 0
      ? lot.priceEur / (1 - salePercent / 100)
      : null;

  const seasonLabel =
    lot.product.season && lot.product.season !== ""
      ? (SEASON_LABELS[lot.product.season] ?? null)
      : null;
  const qualityLabel =
    QUALITY_LABELS[lot.product.quality as QualityLevel] ??
    lot.product.quality ??
    null;
  const countryLabel =
    COUNTRY_LABELS[lot.product.country as Country] ??
    lot.product.country ??
    null;

  const keyFacts: KeyFact[] = [
    { label: "Вага лота", value: `${lot.weight} кг` },
    { label: "К-сть одиниць", value: `${lot.quantity} ${unitLabel}` },
    { label: "Сорт", value: qualityLabel },
    { label: "Сезон", value: seasonLabel },
    { label: "Стать", value: lot.product.gender ?? null },
    { label: "Розміри", value: lot.product.sizes ?? null },
    { label: "Країна", value: countryLabel },
    {
      label: "Категорія",
      value: lot.product.category.name,
      href: `/catalog/${lot.product.category.slug}`,
    },
  ].filter((f) => f.value);

  const otherLots = await prisma.lot.findMany({
    where: {
      productId: lot.productId,
      barcode: { not: lot.barcode },
      status: { in: ["free", "on_sale"] },
    },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          priceUnit: true,
          prices: { select: { priceType: true, amount: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 6,
  });

  const lotUrl = `${SITE_URL}/lot/${encodeURIComponent(barcode)}`;
  const statusLabel = LOT_STATUS_LABELS[lot.status as LotStatus] ?? lot.status;
  const statusBadgeClass =
    lot.status === "free"
      ? "bg-green-600 text-white"
      : lot.status === "on_sale"
        ? "bg-red-600 text-white"
        : "bg-gray-500 text-white";

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs
        items={[{ label: "Лоти", href: "/lots" }, { label: `Лот ${barcode}` }]}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          {videoId ? (
            <>
              <LotVideoPlayer videoId={videoId} barcode={barcode} />
              <p className="mt-3 text-center text-xs text-gray-500">
                Натисніть для перегляду відеоогляду без переходу на YouTube
              </p>
            </>
          ) : heroImage ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-gray-100">
              <Image
                src={heroImage}
                alt={lot.product.name}
                fill
                sizes="(max-width:1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-100 text-sm text-gray-400">
              Огляд скоро
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
            <svg
              className="h-4 w-4 shrink-0 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Це відео знято на нашому складі — реальний вміст лота
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-1 text-xs font-bold uppercase ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
            {lot.status === "free" && (
              <span className="text-sm text-gray-500">
                Готовий до відвантаження
              </span>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold leading-tight lg:text-3xl">
              Лот: {lot.product.name}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Штрихкод: <span className="font-mono">{barcode}</span>
            </p>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-bold text-red-600">
                {priceUah}
              </span>
              <span className="text-base text-gray-500">за лот</span>
              <span className="text-sm text-gray-400">
                (€{lot.priceEur.toFixed(2)}
                {regularPriceEur !== null && (
                  <>
                    {" "}
                    <span className="line-through">
                      €{regularPriceEur.toFixed(2)}
                    </span>
                  </>
                )}
                )
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Розрахунок при курсі {rate.toFixed(2)} ₴/€
            </p>
          </div>

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
                    {fact.href ? (
                      <Link
                        href={fact.href}
                        className="font-medium text-green-700 hover:underline"
                      >
                        {fact.value}
                      </Link>
                    ) : (
                      <span className="font-medium">{fact.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lot.status === "free" || lot.status === "on_sale" ? (
            <>
              <div className="flex items-stretch gap-3">
                <div className="flex-1">
                  <AddToCartButton
                    lot={{
                      lotId: lot.id,
                      productId: lot.productId,
                      productName: lot.product.name,
                      barcode: lot.barcode,
                      weight: lot.weight,
                      priceEur: lot.priceEur,
                      quantity: lot.quantity,
                    }}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-gray-500">
                <ShoppingCart
                  className="mr-1 inline h-3 w-3 align-text-top"
                  aria-hidden
                />
                Замовлення обробляє менеджер. Передоплата не потрібна — ми
                зв&apos;яжемося для підтвердження.
              </p>
            </>
          ) : (
            <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
              Цей лот наразі недоступний для замовлення. Перегляньте інші лоти
              цього товару нижче.
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <Info
              className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
              aria-hidden
            />
            <div className="flex-1 text-sm">
              <p className="text-gray-700">
                Це частина товарної позиції з декількох лотів.
              </p>
              <Link
                href={`/product/${lot.product.slug}`}
                className="font-medium text-blue-700 hover:underline"
              >
                Перейти до товару →
              </Link>
            </div>
          </div>

          <ShareIcons
            url={lotUrl}
            title={`Лот ${barcode} — ${lot.product.name}`}
          />
        </div>
      </div>

      {lot.product.description && (
        <section className="mt-10 rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-xl font-bold">Опис лота</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">
            {lot.product.description}
          </p>
        </section>
      )}

      {otherLots.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">
              Інші лоти цього товару{" "}
              <span className="font-normal text-gray-400">
                ({otherLots.length})
              </span>
            </h2>
            <Link
              href={`/product/${lot.product.slug}`}
              className="text-sm text-green-700 hover:underline"
            >
              Усі лоти {lot.product.name} →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {otherLots.map((other) => (
              <LotCard
                key={other.id}
                lot={{
                  id: other.id,
                  barcode: other.barcode,
                  weight: other.weight,
                  quantity: other.quantity,
                  priceEur: other.priceEur,
                  videoUrl: other.videoUrl,
                  status: other.status,
                  product: {
                    id: other.product.id,
                    slug: other.product.slug,
                    name: other.product.name,
                    priceUnit: other.product.priceUnit,
                  },
                }}
                rate={rate}
                salePercent={
                  other.status === "on_sale"
                    ? computeSalePercent(other.product.prices)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">Доставка та оплата</h2>
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
    </div>
  );
}
