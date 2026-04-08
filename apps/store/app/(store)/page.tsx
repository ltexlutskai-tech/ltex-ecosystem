import { Button } from "@ltex/ui";
import { APP_NAME, MIN_ORDER_KG, CONTACTS } from "@ltex/shared";
import { prisma } from "@ltex/db";
import Link from "next/link";
import { RecentlyViewedSection } from "@/components/store/recently-viewed-section";

export const revalidate = 60;

export default async function HomePage() {
  const parentCategories = await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: { select: { id: true } },
    },
    orderBy: { position: "asc" },
  });

  // Count products in each parent category (including subcategories)
  const categories = await Promise.all(
    parentCategories.map(async (cat) => {
      const childIds = cat.children.map((c) => c.id);
      const allIds = [cat.id, ...childIds];
      const productCount = await prisma.product.count({
        where: { categoryId: { in: allIds }, inStock: true },
      });
      return { ...cat, productCount };
    }),
  );
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

      {/* Hero */}
      <section className="bg-gradient-to-b from-green-50 to-white py-16 lg:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            {APP_NAME}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від{" "}
            {MIN_ORDER_KG} кг. Одяг, взуття, аксесуари з Англії, Німеччини,
            Канади та Польщі.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/catalog">Каталог</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/lots">Лоти (мішки)</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold">Категорії товарів</h2>
          <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/catalog/${cat.slug}`}
                className="group rounded-lg border p-4 transition-colors hover:border-green-500 hover:bg-green-50"
              >
                <h3 className="font-semibold group-hover:text-green-700">
                  {cat.name}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {cat.productCount} товарів
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Від 10 кг",
                desc: "Мінімальне замовлення для гуртових покупців",
              },
              {
                title: "4 країни",
                desc: "Англія, Німеччина, Канада, Польща — якісний товар",
              },
              {
                title: "Відеоогляди",
                desc: "YouTube відео для кожного товару — бачите що купуєте",
              },
              {
                title: "Швидка доставка",
                desc: "Відправка по Україні Новою Поштою та Делівері",
              },
            ].map((f) => (
              <div key={f.title} className="text-center">
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently Viewed */}
      <RecentlyViewedSection />

      {/* CTA */}
      <section className="py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold">Є питання?</h2>
          <p className="mt-2 text-gray-500">
            Зв&apos;яжіться з нами через Telegram або по телефону
          </p>
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
