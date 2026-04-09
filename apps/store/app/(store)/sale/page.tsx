import type { Metadata } from "next";
import { prisma } from "@ltex/db";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { Pagination } from "@/components/store/pagination";
import { ProductCard } from "@/components/store/product-card";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";
const PER_PAGE = 24;

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Акції — знижки на секонд хенд та сток — L-TEX",
  description:
    "Акції та знижки L-TEX: товари за зниженою ціною — секонд хенд, сток, іграшки, Bric-a-Brac. Обмежена кількість, гуртом від 10 кг.",
  alternates: {
    canonical: `${SITE_URL}/sale`,
  },
};

async function loadSaleProducts(page: number) {
  const where = {
    inStock: true,
    prices: { some: { priceType: "akciya" } },
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        images: { take: 1, orderBy: { position: "asc" } },
        prices: {
          where: { priceType: { in: ["wholesale", "akciya"] } },
          take: 5,
        },
        _count: { select: { lots: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
}

export default async function SalePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // DB may be unreachable at build-time prerender (CI with placeholder
  // DATABASE_URL). Fall back to empty data; ISR will populate on first request.
  const { products, total } = await loadSaleProducts(page).catch(
    () =>
      ({ products: [], total: 0 }) as Awaited<
        ReturnType<typeof loadSaleProducts>
      >,
  );

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: dict.sale.title }]} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold">{dict.sale.heading}</h1>
        <p className="mt-1 text-gray-500">{dict.sale.description}</p>
      </div>

      {products.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">{dict.sale.empty}</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} hasSale />
            ))}
          </div>
          <div className="mt-8">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              baseHref="/sale"
            />
          </div>
        </>
      )}
    </div>
  );
}
