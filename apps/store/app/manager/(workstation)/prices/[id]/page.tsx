import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { buildProductShareText } from "@/lib/manager/share-message";
import { loadProductCard } from "../_lib/load-product";
import { ProductCardView } from "../_components/product-card-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Картка товару — L-TEX Manager" };

export default async function ProductCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const [product, rateUah] = await Promise.all([
    loadProductCard(id, user.id),
    getCurrentRate(),
  ]);
  if (!product) notFound();

  // Рекламний текст товара будуємо на сервері (курс EUR — server-side).
  const productShareText = buildProductShareText({
    name: product.name,
    articleCode: product.articleCode,
    description: product.description,
    basePriceEur: product.basePrice?.amount ?? null,
    salePriceEur: product.salePrice,
    isNew: product.isNew,
    videoUrl: product.videoUrl,
    rateUah,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/prices"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до прайсу
        </Link>
      </div>
      <ProductCardView
        product={product}
        productShareText={productShareText}
        rateUah={rateUah}
        sellerName={user.fullName}
      />
    </div>
  );
}
