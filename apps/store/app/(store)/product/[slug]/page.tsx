import type { Metadata } from "next";
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

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { category: true },
  });
  if (!product) return {};
  return {
    title: `${product.name} — ${product.category.name}`,
    description: `${product.name} гуртом. Якість: ${QUALITY_LABELS[product.quality as QualityLevel] ?? product.quality}. ${product.description || "Секонд хенд та сток від L-TEX."}`,
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

  const wholesalePrice = product.prices.find((p) => p.priceType === "wholesale");
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
            product.images.map((img) => (
              <img
                key={img.id}
                src={img.url}
                alt={img.alt || product.name}
                className="w-full rounded-lg border object-cover"
              />
            ))
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
              Немає фото
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold lg:text-3xl">{product.name}</h1>
            {product.articleCode && (
              <p className="mt-1 text-sm text-gray-500">
                Артикул: {product.articleCode}
              </p>
            )}
          </div>

          {/* Prices */}
          <div className="flex items-baseline gap-3">
            {salePrice && (
              <span className="text-2xl font-bold text-red-600">
                €{salePrice.amount.toFixed(2)}
                <span className="text-sm font-normal">
                  /{PRICE_UNIT_LABELS[product.priceUnit as keyof typeof PRICE_UNIT_LABELS]?.replace("€/", "") ?? product.priceUnit}
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
              <span className="text-gray-500">Якість</span>
              <p className="font-medium">
                {QUALITY_LABELS[product.quality as QualityLevel] ?? product.quality}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">Сезон</span>
              <p className="font-medium">
                {SEASON_LABELS[product.season] ?? "Всесезон"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">Країна</span>
              <p className="font-medium">
                {COUNTRY_LABELS[product.country as keyof typeof COUNTRY_LABELS] ?? product.country}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <span className="text-gray-500">Од. ціни</span>
              <p className="font-medium">
                {PRICE_UNIT_LABELS[product.priceUnit as keyof typeof PRICE_UNIT_LABELS] ?? product.priceUnit}
              </p>
            </div>
            {product.averageWeight && (
              <div className="rounded-lg border p-3">
                <span className="text-gray-500">Сер. вага</span>
                <p className="font-medium">{product.averageWeight} кг</p>
              </div>
            )}
          </div>

          {product.description && (
            <div>
              <h2 className="font-semibold">Опис</h2>
              <p className="mt-1 text-sm text-gray-600">{product.description}</p>
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
              Дивитись відео-огляд
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
            Доступні лоти ({product.lots.length})
          </h2>
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Штрихкод</th>
                  <th className="px-4 py-3 font-medium">Вага (кг)</th>
                  <th className="px-4 py-3 font-medium">К-сть</th>
                  <th className="px-4 py-3 font-medium">Ціна EUR</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
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
                        variant={lot.status === "on_sale" ? "accent" : "secondary"}
                      >
                        {LOT_STATUS_LABELS[lot.status as LotStatus] ?? lot.status}
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

      {/* Recommendations */}
      <RecommendationsSection productId={product.id} />
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
          <h2 className="text-xl font-bold">Схожі товари</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            {similar.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      )}

      {boughtTogether.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold">Часто купують разом</h2>
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
