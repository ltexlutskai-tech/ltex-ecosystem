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
  title: `${dict.newPage.title} — L-TEX`,
  description:
    "Нові надходження L-TEX: щойно розмитнені партії секонд хенду, стоку, іграшок та Bric-a-Brac. Перші у наявності — оберіть свіжий товар гуртом від 10 кг.",
  alternates: {
    canonical: `${SITE_URL}/new`,
  },
};

async function loadNewProducts(page: number) {
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { inStock: true },
      orderBy: { createdAt: "desc" },
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
    prisma.product.count({ where: { inStock: true } }),
  ]);

  return { products, total };
}

export default async function NewArrivalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // DB may be unreachable at build-time prerender (CI with placeholder
  // DATABASE_URL). Fall back to empty data; ISR will populate on first request.
  const { products, total } = await loadNewProducts(page).catch(
    () =>
      ({ products: [], total: 0 }) as Awaited<
        ReturnType<typeof loadNewProducts>
      >,
  );

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="container mx-auto px-4 py-6">
      <Breadcrumbs items={[{ label: dict.newPage.title }]} />

      <div className="mt-4">
        <h1 className="text-3xl font-bold">{dict.newPage.heading}</h1>
        <p className="mt-1 text-gray-500">{dict.newPage.description}</p>
      </div>

      {products.length === 0 ? (
        <p className="mt-12 text-center text-gray-500">{dict.newPage.empty}</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} isNew />
            ))}
          </div>
          <div className="mt-8">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              baseHref="/new"
            />
          </div>
        </>
      )}
    </div>
  );
}
