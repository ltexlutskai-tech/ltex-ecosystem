import Link from "next/link";
import { Badge, Card, CardContent } from "@ltex/ui";
import { QUALITY_LABELS, type QualityLevel } from "@ltex/shared";
import { SEASON_LABELS } from "@ltex/shared";

interface ProductCardProps {
  product: {
    slug: string;
    name: string;
    quality: string;
    season: string;
    priceUnit: string;
    country: string;
    videoUrl: string | null;
    images: { url: string; alt: string }[];
    _count: { lots: number };
    prices: { amount: number; currency: string; priceType: string }[];
  };
}

export function ProductCard({ product }: ProductCardProps) {
  const wholesalePrice = product.prices.find(
    (p) => p.priceType === "wholesale",
  );
  const firstImage = product.images[0];

  return (
    <Link href={`/product/${product.slug}`}>
      <Card className="group h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="relative aspect-[4/3] bg-gray-100">
          {firstImage ? (
            <img
              src={firstImage.url}
              alt={firstImage.alt || product.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              {product.videoUrl ? "Video" : "Немає фото"}
            </div>
          )}
          {product._count.lots > 0 && (
            <Badge className="absolute right-2 top-2" variant="secondary">
              {product._count.lots} лотів
            </Badge>
          )}
        </div>
        <CardContent className="p-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight">
            {product.name}
          </h3>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge variant="outline" className="text-xs">
              {QUALITY_LABELS[product.quality as QualityLevel] ?? product.quality}
            </Badge>
            {product.season && (
              <Badge variant="outline" className="text-xs">
                {SEASON_LABELS[product.season] ?? product.season}
              </Badge>
            )}
          </div>
          {wholesalePrice && (
            <p className="mt-2 text-lg font-bold text-green-700">
              €{wholesalePrice.amount.toFixed(2)}
              <span className="text-xs font-normal text-gray-500">
                /{product.priceUnit === "kg" ? "кг" : "шт"}
              </span>
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
