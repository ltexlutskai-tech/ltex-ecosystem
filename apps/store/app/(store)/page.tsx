import { unstable_cache } from "next/cache";
import { Button } from "@ltex/ui";
import { APP_NAME, MIN_ORDER_KG, CONTACTS } from "@ltex/shared";
import { prisma } from "@ltex/db";
import Link from "next/link";
import { RecentlyViewedSection } from "@/components/store/recently-viewed-section";
import { BannerCarousel } from "@/components/store/banner-carousel";
import { CategoriesCarousel } from "@/components/store/categories-carousel";
import { VideoReviewsCarousel } from "@/components/store/video-reviews-carousel";
import { TestimonialsSlider } from "@/components/store/testimonials-slider";
import { ProductCard } from "@/components/store/product-card";
import { getFeaturedProducts } from "@/lib/featured";
import { getVideoReviewProducts } from "@/lib/video-reviews";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

export const revalidate = 60;

const getCachedHomeData = unstable_cache(
  async () => {
    const [
      parentCategories,
      counts,
      banners,
      featured,
      newProducts,
      saleProducts,
      videoProducts,
    ] = await Promise.all([
      prisma.category.findMany({
        where: { parentId: null },
        include: { children: { select: { id: true } } },
        orderBy: { position: "asc" },
      }),
      prisma.product.groupBy({
        by: ["categoryId"],
        where: { inStock: true },
        _count: { _all: true },
      }),
      prisma.banner.findMany({
        where: { isActive: true },
        orderBy: { position: "asc" },
      }),
      getFeaturedProducts(12),
      prisma.product.findMany({
        where: { inStock: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
          prices: {
            where: { priceType: { in: ["wholesale", "akciya"] } },
            take: 5,
          },
          _count: { select: { lots: true } },
        },
      }),
      prisma.product.findMany({
        where: { inStock: true, prices: { some: { priceType: "akciya" } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: {
          images: { take: 1, orderBy: { position: "asc" } },
          prices: {
            where: { priceType: { in: ["wholesale", "akciya"] } },
            take: 5,
          },
          _count: { select: { lots: true } },
        },
      }),
      getVideoReviewProducts(12),
    ]);

    return {
      parentCategories,
      counts,
      banners,
      featured,
      newProducts,
      saleProducts,
      videoProducts,
    };
  },
  ["home-data"],
  { revalidate: 60, tags: ["home"] },
);

export default async function HomePage() {
  // DB may be unreachable at build-time prerender (e.g. CI with placeholder
  // DATABASE_URL). Fall back to empty data; ISR will populate real data on
  // the first production request and revalidate every 60s after.
  const data = await getCachedHomeData().catch(
    () =>
      ({
        parentCategories: [],
        counts: [],
        banners: [],
        featured: [],
        newProducts: [],
        saleProducts: [],
        videoProducts: [],
      }) as Awaited<ReturnType<typeof getCachedHomeData>>,
  );

  const countByCategoryId = new Map(
    data.counts.map((c) => [c.categoryId, c._count._all]),
  );

  const categories = data.parentCategories.map((cat) => {
    const childIds = cat.children.map((c) => c.id);
    const productCount =
      (countByCategoryId.get(cat.id) ?? 0) +
      childIds.reduce((sum, id) => sum + (countByCategoryId.get(id) ?? 0), 0);
    return { ...cat, productCount };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua",
    description:
      "Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto px-4 py-6">
        {/* 1. Banner carousel (tops everything) */}
        {data.banners.length > 0 && <BannerCarousel banners={data.banners} />}

        {/* Fallback hero when no banners are configured */}
        {data.banners.length === 0 && (
          <section className="rounded-lg bg-gradient-to-b from-green-50 to-white py-16 lg:py-20">
            <div className="text-center">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                {APP_NAME}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground sm:text-xl">
                {dict.home.heroDescription.replace(
                  "{min}",
                  String(MIN_ORDER_KG),
                )}
              </p>
              <div className="mt-8 flex justify-center gap-4">
                <Button size="lg" asChild>
                  <Link href="/catalog">{dict.nav.catalog}</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/lots">{dict.home.lotsBtn}</Link>
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* 2. Featured (Топ товарів) — only if admin curated some */}
        {data.featured.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{dict.home.featuredTitle}</h2>
              <Link
                href="/top"
                className="text-sm font-medium text-primary hover:underline"
                data-analytics="home-featured-see-all"
              >
                {dict.home.seeAllFeatured} →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {data.featured.slice(0, 8).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}

        {/* 3. Sale block */}
        {data.saleProducts.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{dict.home.saleTitle}</h2>
              <Link
                href="/sale"
                className="text-sm font-medium text-primary hover:underline"
                data-analytics="home-sale-see-all"
              >
                {dict.home.seeAllSale} →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {data.saleProducts.map((p) => (
                <ProductCard key={p.id} product={p} hasSale />
              ))}
            </div>
          </section>
        )}

        {/* 4. New arrivals block */}
        {data.newProducts.length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{dict.home.newTitle}</h2>
              <Link
                href="/new"
                className="text-sm font-medium text-primary hover:underline"
                data-analytics="home-new-see-all"
              >
                {dict.home.seeAllNew} →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {data.newProducts.map((p) => (
                <ProductCard key={p.id} product={p} isNew />
              ))}
            </div>
          </section>
        )}

        {/* 5. Categories carousel */}
        {categories.length > 0 && (
          <CategoriesCarousel
            categories={categories.map((cat) => ({
              id: cat.id,
              slug: cat.slug,
              name: cat.name,
              productCount: cat.productCount,
            }))}
          />
        )}

        {/* 6. Video reviews carousel */}
        <VideoReviewsCarousel products={data.videoProducts} />

        {/* 7. Recently viewed */}
        <RecentlyViewedSection />
      </div>

      {/* 8. Testimonials */}
      <div className="container mx-auto px-4">
        <TestimonialsSlider />
      </div>

      {/* 9. CTA */}
      <section className="py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold">{dict.home.ctaTitle}</h2>
          <p className="mt-2 text-gray-500">{dict.home.ctaDescription}</p>
          <div className="mt-6 flex justify-center gap-4">
            <Button asChild>
              <a
                href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram {CONTACTS.telegram}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`tel:${CONTACTS.phones[0]?.replace(/\s/g, "")}`}>
                {CONTACTS.phones[0]}
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
