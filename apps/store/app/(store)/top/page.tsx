import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ProductCard } from "@/components/store/product-card";
import { getFeaturedProducts } from "@/lib/featured";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Топ товарів — L-TEX",
  description:
    "Топові товари L-TEX — кращі пропозиції секонд хенду, стоку, іграшок та Bric-a-Brac гуртом від 10 кг.",
  alternates: { canonical: `${SITE_URL}/top` },
};

export default async function TopProductsPage() {
  const products = await getFeaturedProducts(24).catch(() => []);

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: dict.top.title }]} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold">{dict.top.heading}</h1>
        <p className="mt-1 text-gray-500">{dict.top.description}</p>
      </div>

      {products.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">{dict.top.empty}</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
